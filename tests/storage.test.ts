import { afterEach, describe, expect, it } from 'vitest';
import { openDB, deleteDB } from 'idb';
import { buildBackup, createRepository, importBackup, verifyBackup, newId } from '../src/db';
import type { Memory } from '../src/db';
const repos: ReturnType<typeof createRepository>[] = [];
function isolated() {
  const r = createRepository(`test-${newId()}`);
  repos.push(r);
  return r;
}
export function memory(id = newId(), changes: Partial<Memory> = {}): Memory {
  return {
    id,
    title: '사진 없이 남긴 기억',
    regionCode: null,
    regionLabel: null,
    timeType: null,
    timeValue: null,
    computedYear: null,
    emotions: [],
    song: null,
    photoIds: [],
    memo: '원문 그대로',
    isFirst: false,
    isPublic: false,
    createdAt: 1,
    updatedAt: 2,
    ...changes,
  };
}
afterEach(async () => {
  for (const r of repos) {
    const name = (await r.getDb()).name;
    await r.close();
    await deleteDB(name);
  }
  repos.length = 0;
});
describe('isolated local storage and backup', () => {
  it('stores/deletes a memory and its blob atomically', async () => {
    const r = isolated();
    const m = memory('a', { photoIds: ['p'] });
    await r.saveMemory(m, [{ id: 'p', blob: new Blob(['photo'], { type: 'image/webp' }) }]);
    expect(await (await r.getPhotoBlob('p'))?.text()).toBe('photo');
    await r.deleteMemory('a');
    expect(await r.getMemory('a')).toBeUndefined();
    expect(await r.getPhotoBlob('p')).toBeUndefined();
  });
  it('round-trips 120 photo-less memories, unknown times, legacy codes, all settings and IDs', async () => {
    const r = isolated();
    for (let i = 0; i < 120; i++)
      await r.saveMemory(
        memory(String(i), {
          regionCode: 'obsolete-code',
          timeType: 'free',
          timeValue: { freeText: '아주 어릴 때' },
        }),
      );
    await r.setSetting('app_theme', 'D');
    await r.setSetting('birth_year', 1999);
    const { file, missingPhotos } = await buildBackup(r);
    expect(missingPhotos).toBe(0);
    const check = await verifyBackup(file);
    expect(check.added).toBe(120);
    const other = isolated();
    await importBackup(file, other);
    expect(await other.snapshot()).toEqual(await r.snapshot());
    expect((await importBackup(file, other)).skipped).toBe(120);
  });
  it('preserves v2 records, photo references and settings on read', async () => {
    const r = isolated();
    const name = (await r.getDb()).name;
    await r.close();
    await deleteDB(name);
    const old = await openDB(name, 2, {
      upgrade(db) {
        const m = db.createObjectStore('memories', { keyPath: 'id' });
        m.createIndex('by-region', 'regionCode');
        m.createIndex('by-year', 'computedYear');
        const p = db.createObjectStore('photos', { keyPath: 'id' });
        p.createIndex('by-memory', 'memoryId');
        db.createObjectStore('settings');
      },
    });
    const m = memory('v2', {
      photoIds: ['p'],
      regionCode: 'old-123',
      timeType: 'age',
      timeValue: { age: 8 },
      computedYear: null,
    });
    await old.put('memories', m);
    await old.put('photos', {
      id: 'p',
      memoryId: m.id,
      blob: new Blob(['old'], { type: 'image/png' }),
    });
    await old.put('settings', 'B', 'app_theme');
    old.close();
    expect(await r.getMemory('v2')).toEqual(m);
    expect(await r.getSetting('app_theme')).toBe('B');
    expect(await (await r.getPhotoBlob('p'))?.text()).toBe('old');
  });
  it('imports v2 backup repeatedly without overwrites, trims or original field changes', async () => {
    const r = isolated();
    const m = memory('a', { title: '  원래 제목  ', photoIds: ['p'], isPublic: true });
    const f = {
      app: 'kyeokyeoi',
      version: 2,
      settings: { birth_year: 1999 },
      memories: [m, m],
      photos: { p: 'data:image/png;base64,YQ==' },
    };
    expect((await importBackup(f, r)).added).toBe(1);
    expect(await r.getMemory('a')).toEqual(m);
    expect((await importBackup(f, r)).added).toBe(0);
    expect((await importBackup({ ...f, memories: [{ ...m, memo: 'changed' }] }, r)).conflicts).toBe(
      1,
    );
    expect((await r.getMemory('a'))?.memo).toBe(m.memo);
  });
  it('reports missing photos while retaining references and verifies a degraded backup', async () => {
    const r = isolated();
    await r.saveMemory(memory('missing', { photoIds: ['lost'] }));
    const { file, missingPhotos } = await buildBackup(r);
    expect(missingPhotos).toBe(1);
    expect((await verifyBackup(file)).missingPhotos).toBe(1);
    const other = isolated();
    await importBackup(file, other);
    expect((await other.getMemory('missing'))?.photoIds).toEqual(['lost']);
  });
  it('rejects integrity corruption and conflicting duplicate IDs before writing', async () => {
    const r = isolated();
    await r.saveMemory(memory('a'));
    const { file } = await buildBackup(r);
    file.memories[0].memo = 'corrupt';
    const other = isolated();
    await expect(importBackup(file, other)).rejects.toThrow('무결성');
    const duplicate = {
      app: 'kyeokyeoi',
      version: 2,
      settings: {},
      memories: [memory('x'), memory('x', { memo: 'different' })],
      photos: {},
    };
    await expect(importBackup(duplicate, other)).rejects.toThrow('중복');
    expect(await other.getMemories()).toEqual([]);
  });
  it('never overwrites another memory photo on save/import', async () => {
    const r = isolated();
    await r.saveMemory(memory('a', { photoIds: ['p'] }), [
      { id: 'p', blob: new Blob(['a'], { type: 'image/png' }) },
    ]);
    await expect(
      r.saveMemory(memory('b', { photoIds: ['p'] }), [{ id: 'p', blob: new Blob(['b']) }]),
    ).rejects.toThrow('충돌');
    const f = {
      app: 'kyeokyeoi',
      version: 2,
      settings: {},
      memories: [memory('b', { photoIds: ['p'] })],
      photos: { p: 'data:image/png;base64,Yg==' },
    };
    expect((await importBackup(f, r)).conflicts).toBe(1);
    expect(await r.getMemory('b')).toBeUndefined();
    expect(await (await r.getPhotoBlob('p'))?.text()).toBe('a');
  });
  it('upgrades v1 photos transactionally without changing original memory content', async () => {
    const r = isolated();
    const name = (await r.getDb()).name;
    await r.close();
    await deleteDB(name);
    const db = await openDB(name, 1, {
      upgrade(db) {
        const m = db.createObjectStore('memories', { keyPath: 'id' });
        m.createIndex('by-region', 'regionCode');
        m.createIndex('by-year', 'computedYear');
        db.createObjectStore('settings');
      },
    });
    await db.put('memories', { ...memory('v1'), photos: ['data:image/png;base64,YQ=='] });
    db.close();
    const upgraded = await r.getMemory('v1');
    expect(upgraded?.memo).toBe('원문 그대로');
    expect(upgraded?.photoIds).toHaveLength(1);
    expect(await (await r.getPhotoBlob(upgraded!.photoIds[0]))?.text()).toBe('a');
  });
});

describe('independent visits and additional archive stores', () => {
  it('does not infer visits from old memory codes; cancel and delete remain independent', async () => {
    const r = isolated();
    await r.saveMemory(memory('a', { regionCode: '11110' }));
    expect(await r.getRegionVisits()).toEqual([]);
    await r.setRegionsVisited(
      [
        { code: '11110', label: '서울 종로구' },
        { code: '39010', label: '제주시' },
      ],
      true,
    );
    await r.setRegionsVisited([{ code: '11110', label: '서울 종로구' }], true);
    expect(await r.getRegionVisits()).toHaveLength(2);
    expect((await r.getRegionVisits())[0].visitedOn).toBeNull();
    await r.setRegionsVisited([{ code: '11110', label: '서울 종로구' }], false);
    expect(await r.getMemory('a')).toBeDefined();
    await r.deleteMemory('a');
    expect(await r.getRegionVisits()).toHaveLength(1);
  });
  it('round-trips visits-only, overlapping collections and life periods without duplication', async () => {
    const r = isolated();
    await r.setRegionsVisited([{ code: '37430', label: '울릉군' }], true);
    const c = { id: 'c', title: '여름들', memoryIds: [], createdAt: 1, updatedAt: 1 };
    await r.saveCollection(c);
    await r.saveLifePeriod({
      ...c,
      id: 'period',
      title: '학창 시절',
      startYear: null,
      endYear: null,
    });
    const { file } = await buildBackup(r);
    expect((await verifyBackup(file)).visitsAdded).toBe(1);
    const other = isolated();
    await importBackup(file, other);
    await importBackup(file, other);
    expect(await other.snapshot()).toEqual(await r.snapshot());
  });
  it('closes cooperative old tabs for versionchange, and recovers a newer compatible DB', async () => {
    const r = isolated();
    const db = await r.getDb();
    const newer = await openDB(db.name, db.version + 1);
    newer.close();
    expect((await r.getDb()).version).toBe(db.version + 1);
  });
});

describe('recovery, provenance and concurrency', () => {
  it('verifies photo bytes, owner references, metadata, original IDs and orphan blobs', async () => {
    const r = isolated();
    const m = memory('source-id', {
      photoIds: ['photo'],
      regionCode: 'legacy-unknown',
      song: { artist: '가수', title: '노래' },
      emotions: ['기쁨'],
      timeType: 'season',
      timeValue: { season: 'summer' },
      source: { service: 'lifehub', originalId: 'original-1', revision: 2, certainty: 'confirmed' },
      relatedMemoryIds: ['preserved-reference'],
    });
    await r.saveMemory(m, [
      { id: 'photo', blob: new Blob([new Uint8Array([0, 128, 255])], { type: 'image/webp' }) },
    ]);
    await (
      await r.getDb()
    ).put('photos', {
      id: 'orphan',
      memoryId: 'deleted-original',
      blob: new Blob(['keep'], { type: 'image/png' }),
    });
    const { file } = await buildBackup(r);
    expect((await verifyBackup(file)).added).toBe(1);
    const other = isolated();
    await importBackup(file, other);
    expect(await other.getMemory('source-id')).toEqual(m);
    expect([...new Uint8Array(await (await other.getPhotoBlob('photo'))!.arrayBuffer())]).toEqual([
      0, 128, 255,
    ]);
    expect(await (await other.getPhotoBlob('orphan'))?.text()).toBe('keep');
  });
  it('retains the original v1 database if a legacy photo cannot be migrated', async () => {
    const r = isolated();
    const name = (await r.getDb()).name;
    await r.close();
    await deleteDB(name);
    const old = await openDB(name, 1, {
      upgrade(db) {
        const m = db.createObjectStore('memories', { keyPath: 'id' });
        m.createIndex('by-region', 'regionCode');
        m.createIndex('by-year', 'computedYear');
        db.createObjectStore('settings');
      },
    });
    const original = { ...memory('broken-v1'), photos: ['not-a-data-url'] };
    await old.put('memories', original);
    old.close();
    await expect(r.getMemories()).rejects.toThrow();
    const recovery = await openDB(name);
    expect(recovery.version).toBe(1);
    expect(await recovery.get('memories', 'broken-v1')).toEqual(original);
    recovery.close();
    // Remove this deliberately incompatible fixture without attempting another production upgrade.
    repos.splice(repos.indexOf(r), 1);
    await deleteDB(name);
  });
  it('preserves other memories when corrupt legacy photo references overlap during deletion', async () => {
    const r = isolated();
    await r.saveMemory(memory('a', { photoIds: ['shared'] }), [
      { id: 'shared', blob: new Blob(['preserve'], { type: 'image/png' }) },
    ]);
    await r.saveMemory(memory('b', { photoIds: ['shared'] }));
    await r.deleteMemory('a');
    expect(await (await r.getPhotoBlob('shared'))?.text()).toBe('preserve');
    expect((await r.getMemory('b'))?.photoIds).toEqual(['shared']);
  });
  it('rejects stale multi-tab edits without changing the newer memory', async () => {
    const r = isolated();
    const m = memory('a');
    await r.saveMemory(m);
    await r.saveMemory({ ...m, memo: 'newer', updatedAt: 3 }, [], [], 2);
    await expect(r.saveMemory({ ...m, memo: 'stale', updatedAt: 4 }, [], [], 2)).rejects.toThrow(
      '다른 탭',
    );
    expect((await r.getMemory('a'))?.memo).toBe('newer');
  });
  it('recalculates approximate years atomically without changing original expressions or edit timestamps', async () => {
    const r = isolated();
    const m = memory('age', { timeType: 'age', timeValue: { age: 5 }, computedYear: null });
    await r.saveMemory(m);
    await r.recomputeBirthYear(2000);
    expect(await r.getMemory('age')).toEqual({ ...m, computedYear: 2004 });
    expect(await r.getSetting('birth_year')).toBe(2000);
  });
  it('reports unreadable blobs and ownership mismatches without replacing existing records', async () => {
    const r = isolated();
    const v2 = {
      app: 'kyeokyeoi',
      version: 2,
      settings: {},
      memories: [memory('bad', { photoIds: ['bad-photo'] })],
      photos: { 'bad-photo': 'data:image/png;base64,%%%%' },
    };
    const report = await importBackup(v2, r);
    expect(report.invalid).toBe(1);
    expect(report.missingPhotos).toBe(1);
    expect((await r.getMemory('bad'))?.photoIds).toEqual(['bad-photo']);
    const other = isolated();
    const own = {
      ...v2,
      memories: [memory('a', { photoIds: ['same'] }), memory('b', { photoIds: ['same'] })],
      photos: { same: 'data:image/png;base64,YQ==' },
    };
    await expect(importBackup(own, other)).rejects.toThrow('여러 기억');
    expect(await other.getMemories()).toEqual([]);
  });
});
it('repairs missing blobs on an identical-memory import and reports different photo contents', async () => {
  const r = isolated();
  const m = memory('repair', { photoIds: ['p'] });
  await r.saveMemory(m);
  const f = {
    app: 'kyeokyeoi',
    version: 2,
    settings: {},
    memories: [m],
    photos: { p: 'data:image/png;base64,YQ==' },
  };
  await importBackup(f, r);
  expect(await (await r.getPhotoBlob('p'))?.text()).toBe('a');
  const report = await importBackup({ ...f, photos: { p: 'data:image/png;base64,Yg==' } }, r);
  expect(report.conflicts).toBe(1);
  expect(await (await r.getPhotoBlob('p'))?.text()).toBe('a');
});
