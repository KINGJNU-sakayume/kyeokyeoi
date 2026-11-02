import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import { buildBackup, createRepository, importBackup, newId } from '../src/db';
import { sourceFor } from '../src/integration/lifehub';
import type { Memory } from '../src/db';

function memory(id: string, changes: Partial<Memory> = {}): Memory {
  return {
    id, title: '가상의 기억', regionCode: null, regionLabel: null, timeType: null, timeValue: null, computedYear: null,
    emotions: [], song: null, photoIds: [], memo: null, isFirst: false, isPublic: false, createdAt: 1, updatedAt: 2, ...changes,
  };
}

const repos: ReturnType<typeof createRepository>[] = [];
function isolated() {
  const r = createRepository(`lifehub-${newId()}`);
  repos.push(r);
  return r;
}
afterEach(async () => {
  for (const r of repos) {
    const name = (await r.getDb()).name;
    await r.close();
    await deleteDB(name);
  }
  repos.length = 0;
});
const KEY = 'claude:mcp-' + 'a'.repeat(40);

describe('Life Hub receipts in the local archive', () => {
  it('one proposal becomes at most one memory, even if approved twice', async () => {
    const repo = isolated();
    await repo.saveMemory(memory('m1', { source: sourceFor(KEY) }));
    await expect(repo.saveMemory(memory('m2', { source: sourceFor(KEY) }))).rejects.toThrow('이미');
    // Editing the memory that owns the source is still allowed.
    await repo.saveMemory(memory('m1', { source: sourceFor(KEY), title: '고친 제목', updatedAt: 3 }));
    expect((await repo.getMemories()).map((m) => m.id)).toEqual(['m1']);
  });

  it('a visit from a proposal is idempotent and never overwrites an existing visit', async () => {
    const repo = isolated();
    const first = await repo.recordVisitFromSource({ code: '51150', label: '강원 강릉시' }, '2026-10-12', sourceFor(KEY));
    const again = await repo.recordVisitFromSource({ code: '51150', label: '강원 강릉시' }, '2026-10-12', sourceFor(KEY));
    expect(again.id).toBe(first.id);
    expect(first.source?.originalId).toBe(KEY);

    await repo.setRegionsVisited([{ code: '11010', label: '서울 종로구' }], true, '2020-01-01');
    const before = (await repo.getRegionVisits()).find((v) => v.regionCode === '11010')!;
    const other = 'claude:mcp-' + 'b'.repeat(40);
    const onExisting = await repo.recordVisitFromSource({ code: '11010', label: '서울 종로구' }, '2026-01-01', sourceFor(other));
    expect(onExisting).toEqual(before);
    await expect(repo.recordVisitFromSource({ code: '1', label: 'x' }, '2026-02-30x', sourceFor(other))).rejects.toThrow();
  });

  it('sources survive a backup round trip, so receipts can be rebuilt after restore', async () => {
    const repo = isolated();
    await repo.saveMemory(memory('m1', { source: sourceFor(KEY) }));
    await repo.recordVisitFromSource({ code: '51150', label: '강원 강릉시' }, null, sourceFor('claude:mcp-' + 'c'.repeat(40)));
    const { file } = await buildBackup(repo);
    const restored = isolated();
    await importBackup(file, restored);
    expect((await restored.getMemories())[0].source).toEqual(sourceFor(KEY));
    expect((await restored.getRegionVisits())[0].source?.service).toBe('life-hub');
  });
});
