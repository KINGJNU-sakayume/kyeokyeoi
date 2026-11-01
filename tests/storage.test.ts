import { afterEach, describe, expect, it } from 'vitest';
import { openDB, deleteDB } from 'idb';
import { buildBackup, createRepository, importBackup, verifyBackup, newId } from '../src/db';
import type { Memory } from '../src/db';
const repos: ReturnType<typeof createRepository>[] = [];
function isolated() { const r = createRepository(`test-${newId()}`); repos.push(r); return r; }
export function memory(id = newId(), changes: Partial<Memory> = {}): Memory {
  return { id, title: '사진 없이 남긴 기억', regionCode: null, regionLabel: null, timeType: null, timeValue: null, computedYear: null, emotions: [], song: null, photoIds: [], memo: '원문 그대로', isFirst: false, isPublic: false, createdAt: 1, updatedAt: 2, ...changes };
}
afterEach(async () => { for (const r of repos) { const name = (await r.getDb()).name; await r.close(); await deleteDB(name); } repos.length = 0; });
describe('isolated local storage and backup', () => {
  it('stores/deletes a memory and its blob atomically', async () => {
    const r = isolated(); const m = memory('a', { photoIds: ['p'] });
    await r.saveMemory(m, [{ id: 'p', blob: new Blob(['photo'], { type: 'image/webp' }) }]);
    expect(await (await r.getPhotoBlob('p'))?.text()).toBe('photo');
    await r.deleteMemory('a'); expect(await r.getMemory('a')).toBeUndefined(); expect(await r.getPhotoBlob('p')).toBeUndefined();
  });
  it('round-trips 120 photo-less memories, unknown times, legacy codes, all settings and IDs', async () => {
    const r = isolated();
    for (let i = 0; i < 120; i++) await r.saveMemory(memory(String(i), { regionCode: 'obsolete-code', timeType: 'free', timeValue: { freeText: '아주 어릴 때' } }));
    await r.setSetting('app_theme', 'D'); await r.setSetting('birth_year', 1999);
    const { file, missingPhotos } = await buildBackup(r); expect(missingPhotos).toBe(0);
    const check = await verifyBackup(file); expect(check.added).toBe(120);
    const other = isolated(); await importBackup(file, other);
    expect(await other.snapshot()).toEqual(await r.snapshot());
    expect((await importBackup(file, other)).skipped).toBe(120);
  });
  it('preserves v2 records, photo references and settings on read', async () => {
    const r = isolated(); const name = (await r.getDb()).name; await r.close(); await deleteDB(name);
    const old = await openDB(name, 2, { upgrade(db) {
      const m = db.createObjectStore('memories', { keyPath: 'id' }); m.createIndex('by-region', 'regionCode'); m.createIndex('by-year', 'computedYear');
      const p = db.createObjectStore('photos', { keyPath: 'id' }); p.createIndex('by-memory', 'memoryId'); db.createObjectStore('settings');
    } });
    const m = memory('v2', { photoIds: ['p'], regionCode: 'old-123', timeType: 'age', timeValue: { age: 8 }, computedYear: null });
    await old.put('memories', m); await old.put('photos', { id: 'p', memoryId: m.id, blob: new Blob(['old'], { type: 'image/png' }) }); await old.put('settings', 'B', 'app_theme'); old.close();
    expect(await r.getMemory('v2')).toEqual(m); expect(await r.getSetting('app_theme')).toBe('B'); expect(await (await r.getPhotoBlob('p'))?.text()).toBe('old');
  });
  it('imports v2 backup repeatedly without overwrites, trims or original field changes', async () => {
    const r = isolated(); const m = memory('a', { title: '  원래 제목  ', photoIds: ['p'], isPublic: true });
    const f = { app: 'kyeokyeoi', version: 2, settings: { birth_year: 1999 }, memories: [m, m], photos: { p: 'data:image/png;base64,YQ==' } };
    expect((await importBackup(f, r)).added).toBe(1); expect(await r.getMemory('a')).toEqual(m);
    expect((await importBackup(f, r)).added).toBe(0);
    expect((await importBackup({ ...f, memories: [{ ...m, memo: 'changed' }] }, r)).conflicts).toBe(1);
    expect((await r.getMemory('a'))?.memo).toBe(m.memo);
  });
  it('reports missing photos while retaining references and verifies a degraded backup', async () => {
    const r = isolated(); await r.saveMemory(memory('missing', { photoIds: ['lost'] }));
    const { file, missingPhotos } = await buildBackup(r); expect(missingPhotos).toBe(1);
    expect((await verifyBackup(file)).missingPhotos).toBe(1);
    const other = isolated(); await importBackup(file, other); expect((await other.getMemory('missing'))?.photoIds).toEqual(['lost']);
  });
  it('rejects integrity corruption and conflicting duplicate IDs before writing', async () => {
    const r = isolated(); await r.saveMemory(memory('a')); const { file } = await buildBackup(r);
    file.memories[0].memo = 'corrupt'; const other = isolated(); await expect(importBackup(file, other)).rejects.toThrow('무결성');
    const duplicate = { app: 'kyeokyeoi', version: 2, settings: {}, memories: [memory('x'), memory('x', { memo: 'different' })], photos: {} };
    await expect(importBackup(duplicate, other)).rejects.toThrow('중복'); expect(await other.getMemories()).toEqual([]);
  });
  it('never overwrites another memory photo on save/import', async () => {
    const r = isolated(); await r.saveMemory(memory('a', { photoIds: ['p'] }), [{ id: 'p', blob: new Blob(['a'], { type: 'image/png' }) }]);
    await expect(r.saveMemory(memory('b', { photoIds: ['p'] }), [{ id: 'p', blob: new Blob(['b']) }])).rejects.toThrow('충돌');
    const f = { app: 'kyeokyeoi', version: 2, settings: {}, memories: [memory('b', { photoIds: ['p'] })], photos: { p: 'data:image/png;base64,Yg==' } };
    expect((await importBackup(f, r)).conflicts).toBe(1); expect(await r.getMemory('b')).toBeUndefined(); expect(await (await r.getPhotoBlob('p'))?.text()).toBe('a');
  });
  it('upgrades v1 photos transactionally without changing original memory content', async () => {
    const r = isolated(); const name = (await r.getDb()).name; await r.close(); await deleteDB(name);
    const db = await openDB(name, 1, { upgrade(db) { const m = db.createObjectStore('memories', { keyPath: 'id' }); m.createIndex('by-region', 'regionCode'); m.createIndex('by-year', 'computedYear'); db.createObjectStore('settings'); } });
    await db.put('memories', { ...memory('v1'), photos: ['data:image/png;base64,YQ=='] }); db.close();
    const upgraded = await r.getMemory('v1'); expect(upgraded?.memo).toBe('원문 그대로'); expect(upgraded?.photoIds).toHaveLength(1); expect(await (await r.getPhotoBlob(upgraded!.photoIds[0]))?.text()).toBe('a');
  });
});
