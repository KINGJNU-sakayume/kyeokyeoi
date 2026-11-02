import { computeYear } from '../utils/timeUtils';
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type {
  Memory,
  PhotoRecord,
  SettingKey,
  RegionVisit,
  MemoryCollection,
  LifePeriod,
  SourceReference,
} from './model';
import {
  decodePhoto,
  encodePhoto,
  mergeBackup,
  serializeBackup,
  validateBackup,
  canonical,
} from './backup';
export * from './model';
export type { BackupFile, ImportReport } from './backup';

export const DB_NAME = 'kkyeokyeoi-db';
export const DB_VERSION = 3;
export const MAX_PHOTOS = 5;
export const DATA_STORES = [
  'memories',
  'photos',
  'settings',
  'regionVisits',
  'collections',
  'lifePeriods',
] as const;
export type Snapshot = {
  memories: Memory[];
  photos: PhotoRecord[];
  settings: Record<string, unknown>;
  regionVisits: RegionVisit[];
  collections: MemoryCollection[];
  lifePeriods: LifePeriod[];
};

export function newId(): string {
  return crypto.randomUUID();
}
export const dataURLToBlob = decodePhoto;

function storageEvent(message: string) {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('storage-status', { detail: message }));
}

/** Each test/restore rehearsal uses its own named database; production keeps its original name. */
export function createRepository(name: string) {
  let pending: Promise<IDBPDatabase> | null = null;
  let connection: IDBPDatabase | null = null;
  const getDb = (): Promise<IDBPDatabase> => {
    if (pending) return pending;
    const options = {
      async upgrade(
        db: IDBPDatabase,
        oldVersion: number,
        _v: number | null,
        tx: import('idb').IDBPTransaction<unknown, string[], 'versionchange'>,
      ) {
        try {
          if (oldVersion < 1) {
            const store = db.createObjectStore('memories', { keyPath: 'id' });
            store.createIndex('by-region', 'regionCode');
            store.createIndex('by-year', 'computedYear');
            db.createObjectStore('settings');
          }
          if (oldVersion < 2) {
            const photos = db.createObjectStore('photos', { keyPath: 'id' });
            photos.createIndex('by-memory', 'memoryId');
            if (oldVersion >= 1) {
              let cursor = await tx.objectStore('memories').openCursor();
              while (cursor) {
                const old = cursor.value;
                const photoIds = [...(old.photoIds ?? [])];
                for (const data of old.photos ?? []) {
                  const blob = decodePhoto(data);
                  // Abort the whole upgrade rather than discard an unreadable original.
                  if (!blob) {
                    throw new Error('이전 사진을 변환하지 못했어요. 원본 데이터는 유지됩니다.');
                  }
                  const id = newId();
                  await photos.add({ id, memoryId: old.id, blob });
                  photoIds.push(id);
                }
                const next = { ...old, photoIds };
                delete next.photos;
                await cursor.update(next);
                cursor = await cursor.continue();
              }
            }
          }
          if (oldVersion < 3) {
            const visits = db.createObjectStore('regionVisits', { keyPath: 'regionCode' });
            visits.createIndex('by-id', 'id', { unique: true });
            db.createObjectStore('collections', { keyPath: 'id' });
            db.createObjectStore('lifePeriods', { keyPath: 'id' });
          }
        } catch {
          try {
            tx.abort();
          } catch {
            /* already aborted */
          }
          await tx.done.catch(() => {});
        }
      },
      blocked() {
        storageEvent(
          '다른 탭이 저장소를 사용 중이에요. 켜켜이의 다른 탭을 닫으면 이어서 열립니다.',
        );
      },
      blocking() {
        connection?.close();
        connection = null;
        pending = null;
        storageEvent('다른 탭에서 저장소를 갱신했어요. 입력 내용을 보관한 뒤 새로고침해 주세요.');
      },
      terminated() {
        connection = null;
        pending = null;
        storageEvent('저장소 연결이 끊겼어요. 다시 시도해 주세요.');
      },
    };
    pending = openDB(name, DB_VERSION, options)
      .catch(async (e) => {
        // Compatible recovery builds can read a newer schema without downgrading it.
        if (e instanceof DOMException && e.name === 'VersionError')
          return openDB(name, undefined, options);
        throw e;
      })
      .then((db) => {
        if (DATA_STORES.some((s) => !db.objectStoreNames.contains(s))) {
          db.close();
          throw new Error(
            '저장소 구조가 호환되지 않아요. 데이터를 삭제하지 말고 백업 가능한 복구 버전으로 열어 주세요.',
          );
        }
        connection = db;
        return db;
      })
      .catch((e) => {
        pending = null;
        throw e;
      });
    return pending;
  };
  return {
    getDb,
    async close() {
      (await pending)?.close();
      pending = null;
      connection = null;
    },
    async getMemories(): Promise<Memory[]> {
      return (await getDb()).getAll('memories');
    },
    async getMemory(id: string): Promise<Memory | undefined> {
      return (await getDb()).get('memories', id);
    },
    async saveMemory(
      memory: Memory,
      addPhotos: { id: string; blob: Blob }[] = [],
      removePhotoIds: string[] = [],
      expectedUpdatedAt?: number,
    ) {
      const db = await getDb();
      const tx = db.transaction(['memories', 'photos'], 'readwrite');
      try {
        const stored = await tx.objectStore('memories').get(memory.id);
        if (expectedUpdatedAt !== undefined && stored?.updatedAt !== expectedUpdatedAt)
          throw new Error(
            '다른 탭에서 기억이 변경됐어요. 입력을 복사한 뒤 최신 기록을 다시 열어 주세요.',
          );
        // One external proposal becomes at most one memory, even if approved twice (another tab, a retry).
        if (memory.source) {
          const all: Memory[] = await tx.objectStore('memories').getAll();
          if (
            all.some(
              (m) =>
                m.id !== memory.id &&
                m.source?.service === memory.source!.service &&
                m.source.originalId === memory.source!.originalId,
            )
          )
            throw new Error('이 제안으로 만든 추억이 이미 있어요.');
        }
        const photos = tx.objectStore('photos');
        for (const p of addPhotos) {
          const previous: PhotoRecord | undefined = await photos.get(p.id);
          if (previous) throw new Error(`다른 기억의 사진 ID와 충돌합니다: ${p.id}`);
          if (!memory.photoIds.includes(p.id)) throw new Error('사진 참조가 일치하지 않아요.');
          await photos.put({ ...p, memoryId: memory.id });
        }
        for (const id of removePhotoIds) {
          const p: PhotoRecord | undefined = await photos.get(id);
          if (p && p.memoryId !== memory.id)
            throw new Error('다른 기억의 사진은 삭제할 수 없어요.');
          const others: Memory[] = await tx.objectStore('memories').getAll();
          if (!others.some((m) => m.id !== memory.id && m.photoIds.includes(id)))
            await photos.delete(id);
        }
        await tx.objectStore('memories').put(memory);
        await tx.done;
      } catch (e) {
        try {
          tx.abort();
        } catch {
          /* already aborted */
        }
        await tx.done.catch(() => {});
        throw e;
      }
      if (typeof navigator !== 'undefined') navigator.storage?.persist?.().catch(() => {});
    },
    async updateMemories(memories: Memory[]) {
      const tx = (await getDb()).transaction('memories', 'readwrite');
      for (const m of memories) await tx.store.put(m);
      await tx.done;
    },
    async deleteMemory(id: string) {
      const tx = (await getDb()).transaction(['memories', 'photos'], 'readwrite');
      const keys = await tx.objectStore('photos').index('by-memory').getAllKeys(id);
      const others: Memory[] = await tx.objectStore('memories').getAll();
      for (const k of keys)
        if (!others.some((m) => m.id !== id && m.photoIds.includes(String(k))))
          await tx.objectStore('photos').delete(k);
      await tx.objectStore('memories').delete(id);
      await tx.done;
    },
    async getPhotoBlob(id: string): Promise<Blob | undefined> {
      return (await getDb()).get('photos', id).then((p) => p?.blob);
    },
    async getSetting<T>(key: SettingKey): Promise<T | undefined> {
      return (await getDb()).get('settings', key);
    },
    async setSetting<T>(key: SettingKey, value: T) {
      await (await getDb()).put('settings', value, key);
    },
    async recomputeBirthYear(year: number) {
      const tx = (await getDb()).transaction(['settings', 'memories'], 'readwrite');
      const all: Memory[] = await tx.objectStore('memories').getAll();
      for (const m of all)
        if (m.timeType === 'age' || m.timeType === 'grade')
          await tx
            .objectStore('memories')
            .put({ ...m, computedYear: computeYear(m.timeType, m.timeValue, year) });
      await tx.objectStore('settings').put(year, 'birth_year');
      await tx.done;
    },
    async getRegionVisits(): Promise<RegionVisit[]> {
      return (await getDb()).getAll('regionVisits');
    },
    async setRegionsVisited(
      regions: { code: string; label: string }[],
      visited: boolean,
      visitedOn: string | null = null,
    ) {
      if (
        visitedOn &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(visitedOn) || Number.isNaN(Date.parse(visitedOn)))
      )
        throw new Error('방문 날짜를 확인해 주세요.');
      const tx = (await getDb()).transaction('regionVisits', 'readwrite');
      for (const r of regions) {
        if (visited) {
          const old = await tx.store.get(r.code);
          if (!old)
            await tx.store.add({
              id: newId(),
              regionCode: r.code,
              regionLabel: r.label,
              visitedOn,
              recordedAt: Date.now(),
              updatedAt: Date.now(),
            } satisfies RegionVisit);
        } else await tx.store.delete(r.code);
      }
      await tx.done;
    },
    /**
     * Mark a region visited because the owner approved an external proposal. Idempotent: the same source
     * returns the visit it created before. A region already visited keeps its record unchanged and that
     * visit is returned; nothing is overwritten or removed.
     */
    async recordVisitFromSource(
      region: { code: string; label: string },
      visitedOn: string | null,
      source: SourceReference,
    ): Promise<RegionVisit> {
      if (
        visitedOn &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(visitedOn) || Number.isNaN(Date.parse(visitedOn)))
      )
        throw new Error('방문 날짜를 확인해 주세요.');
      const tx = (await getDb()).transaction('regionVisits', 'readwrite');
      const all: RegionVisit[] = await tx.store.getAll();
      const same = all.find(
        (v) => v.source?.service === source.service && v.source.originalId === source.originalId,
      );
      const existing = same ?? all.find((v) => v.regionCode === region.code);
      if (existing) {
        await tx.done;
        return existing;
      }
      const now = Date.now();
      const visit: RegionVisit = {
        id: newId(),
        regionCode: region.code,
        regionLabel: region.label,
        visitedOn,
        recordedAt: now,
        updatedAt: now,
        source,
      };
      await tx.store.add(visit);
      await tx.done;
      return visit;
    },
    async getCollections(): Promise<MemoryCollection[]> {
      return (await getDb()).getAll('collections');
    },
    async saveCollection(value: MemoryCollection) {
      await (await getDb()).put('collections', value);
    },
    async deleteCollection(id: string) {
      await (await getDb()).delete('collections', id);
    },
    async getLifePeriods(): Promise<LifePeriod[]> {
      return (await getDb()).getAll('lifePeriods');
    },
    async saveLifePeriod(value: LifePeriod) {
      await (await getDb()).put('lifePeriods', value);
    },
    async deleteLifePeriod(id: string) {
      await (await getDb()).delete('lifePeriods', id);
    },
    async snapshot(): Promise<Snapshot> {
      const tx = (await getDb()).transaction([...DATA_STORES], 'readonly');
      const [memories, photos, keys, values, regionVisits, collections, lifePeriods] =
        await Promise.all([
          tx.objectStore('memories').getAll(),
          tx.objectStore('photos').getAll(),
          tx.objectStore('settings').getAllKeys(),
          tx.objectStore('settings').getAll(),
          tx.objectStore('regionVisits').getAll(),
          tx.objectStore('collections').getAll(),
          tx.objectStore('lifePeriods').getAll(),
        ]);
      await tx.done;
      return {
        memories,
        photos,
        regionVisits,
        collections,
        lifePeriods,
        settings: Object.fromEntries(keys.map((k, i) => [String(k), values[i]])),
      };
    },
  };
}
export type Repository = ReturnType<typeof createRepository>;
export const repository = createRepository(DB_NAME);
export const {
  getMemories,
  getMemory,
  saveMemory,
  updateMemories,
  deleteMemory,
  getPhotoBlob,
  getSetting,
  setSetting,
  getRegionVisits,
  setRegionsVisited,
  getCollections,
  saveCollection,
  deleteCollection,
  getLifePeriods,
  saveLifePeriod,
  deleteLifePeriod,
} = repository;

export async function estimateUsage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e?.usage != null && e.quota != null ? { usage: e.usage, quota: e.quota } : null;
  } catch {
    return null;
  }
}
export async function buildBackup(repo = repository) {
  return serializeBackup(await repo.snapshot());
}
export async function importBackup(json: unknown, repo = repository) {
  return mergeBackup(json, repo);
}

/** Restore into a disposable database, compare every record and photo, then delete it. */
export async function verifyBackup(json: unknown) {
  const name = `kyeokyeoi-restore-check-${newId()}`;
  const temporary = createRepository(name);
  try {
    const report = await importBackup(json, temporary);
    const { file } = await buildBackup(temporary);
    const original = await validateBackup(json);
    const restored = await validateBackup(file);
    if (canonical(original) !== canonical(restored))
      throw new Error('복원한 데이터가 백업 원본과 일치하지 않아요.');
    return report;
  } finally {
    await temporary.close();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
export { encodePhoto };
