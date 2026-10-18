import { openDB } from 'idb';
import type { IDBPDatabase, IDBPTransaction } from 'idb';

export type TimeType = 'date' | 'month' | 'year' | 'season' | 'age' | 'grade' | 'free';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type SchoolType = 'elementary' | 'middle' | 'high';

export interface TimeValue {
  year?: number;
  month?: number;
  day?: number;
  season?: Season;
  age?: number;
  schoolType?: SchoolType;
  schoolGrade?: number;
  freeText?: string;
}

export interface Memory {
  id: string;
  title: string;
  regionCode: string | null;
  regionLabel: string | null;
  timeType: TimeType | null;
  timeValue: TimeValue | null;
  computedYear: number | null;
  emotions: string[];
  song: { artist: string; title: string } | null;
  /** 사진은 photos 저장소에 Blob으로 따로 있어요. 여기엔 순서대로 id만 둬요. */
  photoIds: string[];
  memo: string | null;
  isFirst: boolean;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PhotoRecord {
  id: string;
  memoryId: string;
  blob: Blob;
}

export type SettingKey = 'birth_year' | 'app_theme' | 'onboarding_done' | 'last_backup_at';

const DB_NAME = 'kkyeokyeoi-db'; // 이미 쓰고 있는 이름이라 철자를 바꾸지 않아요
const DB_VERSION = 2;

export const MAX_PHOTOS = 5;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** data URL → Blob (동기). 업그레이드 트랜잭션 안에서는 fetch 같은 비동기 작업을 쓸 수 없어서 직접 디코딩해요. */
export function dataURLToBlob(dataURL: string): Blob | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataURL);
  if (!m) return null;
  const type = m[1] || 'application/octet-stream';
  try {
    if (m[2]) {
      const bin = atob(m[3]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type });
    }
    return new Blob([decodeURIComponent(m[3])], { type });
  } catch {
    return null;
  }
}

async function migrateV1Photos(tx: IDBPTransaction<unknown, string[], 'versionchange'>) {
  const memories = tx.objectStore('memories');
  const photos = tx.objectStore('photos');
  let cursor = await memories.openCursor();
  while (cursor) {
    const old = cursor.value as Memory & { photos?: string[] };
    const photoIds: string[] = [];
    for (const dataURL of old.photos ?? []) {
      const blob = typeof dataURL === 'string' ? dataURLToBlob(dataURL) : null;
      if (!blob) continue;
      const id = newId();
      await photos.put({ id, memoryId: old.id, blob } satisfies PhotoRecord);
      photoIds.push(id);
    }
    const next: Memory & { photos?: string[] } = { ...old, photoIds };
    delete next.photos;
    await cursor.update(next);
    cursor = await cursor.continue();
  }
}

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const memories = db.createObjectStore('memories', { keyPath: 'id' });
          memories.createIndex('by-region', 'regionCode');
          memories.createIndex('by-year', 'computedYear');
          db.createObjectStore('settings');
        }
        if (oldVersion < 2) {
          const photos = db.createObjectStore('photos', { keyPath: 'id' });
          photos.createIndex('by-memory', 'memoryId');
          if (oldVersion >= 1) await migrateV1Photos(tx);
        }
      },
    });
  }
  return dbPromise;
}

// ---------- Memories ----------

export async function getMemories(): Promise<Memory[]> {
  const db = await getDb();
  return db.getAll('memories');
}

export async function getMemory(id: string): Promise<Memory | undefined> {
  const db = await getDb();
  return db.get('memories', id);
}

/**
 * 추억과 사진을 한 트랜잭션으로 저장해요. 중간에 실패하면 아무것도 바뀌지 않아요.
 * addPhotos: 새로 붙인 사진, removePhotoIds: 이번에 뺀 사진
 */
export async function saveMemory(
  memory: Memory,
  addPhotos: { id: string; blob: Blob }[] = [],
  removePhotoIds: string[] = [],
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['memories', 'photos'], 'readwrite');
  const photos = tx.objectStore('photos');
  await Promise.all([
    ...addPhotos.map(p => photos.put({ id: p.id, memoryId: memory.id, blob: p.blob } satisfies PhotoRecord)),
    ...removePhotoIds.map(id => photos.delete(id)),
    tx.objectStore('memories').put(memory),
  ]);
  await tx.done;
  requestPersistence();
}

export async function updateMemories(memories: Memory[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('memories', 'readwrite');
  await Promise.all(memories.map(m => tx.store.put(m)));
  await tx.done;
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['memories', 'photos'], 'readwrite');
  const photoKeys = await tx.objectStore('photos').index('by-memory').getAllKeys(id);
  await Promise.all([
    ...photoKeys.map(k => tx.objectStore('photos').delete(k)),
    tx.objectStore('memories').delete(id),
  ]);
  await tx.done;
}

// ---------- Photos ----------

export async function getPhotoBlob(id: string): Promise<Blob | undefined> {
  const db = await getDb();
  const rec = (await db.get('photos', id)) as PhotoRecord | undefined;
  return rec?.blob;
}

// ---------- Settings ----------

export async function getSetting<T>(key: SettingKey): Promise<T | undefined> {
  const db = await getDb();
  return db.get('settings', key);
}

export async function setSetting<T>(key: SettingKey, value: T): Promise<void> {
  const db = await getDb();
  await db.put('settings', value, key);
}

// ---------- Storage ----------

let persistAsked = false;
/** 브라우저가 공간이 부족할 때 기록을 지우지 않도록 요청해요 (지원하는 브라우저에서만). */
function requestPersistence() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

export async function estimateUsage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est || est.usage == null || est.quota == null) return null;
    return { usage: est.usage, quota: est.quota };
  } catch {
    return null;
  }
}

// ---------- Backup ----------

export interface BackupFile {
  app: 'kyeokyeoi';
  version: 2;
  exportedAt: string;
  settings: { birth_year?: number };
  memories: Memory[];
  photos: Record<string, string>; // photoId → data URL
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function buildBackup(): Promise<{ file: BackupFile; missingPhotos: number }> {
  const db = await getDb();
  const memories: Memory[] = await db.getAll('memories');
  const photos: Record<string, string> = {};
  let missingPhotos = 0;
  for (const m of memories) {
    for (const id of m.photoIds) {
      const rec = (await db.get('photos', id)) as PhotoRecord | undefined;
      if (rec) photos[id] = await blobToDataURL(rec.blob);
      else missingPhotos++;
    }
  }
  const birthYear = await db.get('settings', 'birth_year');
  return {
    file: {
      app: 'kyeokyeoi',
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: typeof birthYear === 'number' ? { birth_year: birthYear } : {},
      memories,
      photos,
    },
    missingPhotos,
  };
}

const TIME_TYPES = new Set(['date', 'month', 'year', 'season', 'age', 'grade', 'free']);

function cleanMemory(raw: unknown): Memory | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || !m.id || typeof m.title !== 'string' || !m.title.trim()) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const song = m.song && typeof m.song === 'object' ? (m.song as Record<string, unknown>) : null;
  return {
    id: m.id,
    title: m.title.trim(),
    regionCode: str(m.regionCode),
    regionLabel: str(m.regionLabel),
    timeType: typeof m.timeType === 'string' && TIME_TYPES.has(m.timeType) ? (m.timeType as TimeType) : null,
    timeValue: m.timeValue && typeof m.timeValue === 'object' ? (m.timeValue as TimeValue) : null,
    computedYear: num(m.computedYear),
    emotions: Array.isArray(m.emotions) ? m.emotions.filter((e): e is string => typeof e === 'string') : [],
    song: song ? { artist: str(song.artist) ?? '', title: str(song.title) ?? '' } : null,
    photoIds: Array.isArray(m.photoIds) ? m.photoIds.filter((p): p is string => typeof p === 'string') : [],
    memo: str(m.memo),
    isFirst: m.isFirst === true,
    isPublic: false,
    createdAt: num(m.createdAt) ?? Date.now(),
    updatedAt: num(m.updatedAt) ?? Date.now(),
  };
}

const PHOTO_DATA_URL = /^data:image\/(png|jpeg|webp|gif|avif);base64,/;
const MAX_PHOTO_CHARS = 12 * 1024 * 1024;

/**
 * 백업을 합쳐요. 이미 있는 추억(같은 id)은 그대로 두고, 없는 추억만 더해요.
 * 형식이 틀린 항목과 이미지가 아닌 사진은 건너뛰어요.
 */
export async function importBackup(json: unknown): Promise<{ added: number; skipped: number; invalid: number }> {
  if (!json || typeof json !== 'object') throw new Error('백업 파일 형식이 아니에요.');
  const f = json as Partial<BackupFile>;
  if (f.app !== 'kyeokyeoi' || f.version !== 2 || !Array.isArray(f.memories)) {
    throw new Error('켜켜이 백업 파일이 아니에요.');
  }
  const photoMap = f.photos && typeof f.photos === 'object' ? f.photos : {};
  const db = await getDb();
  const existing = new Set((await db.getAllKeys('memories')).map(String));

  let added = 0, skipped = 0, invalid = 0;
  const tx = db.transaction(['memories', 'photos', 'settings'], 'readwrite');
  for (const raw of f.memories) {
    const m = cleanMemory(raw);
    if (!m) { invalid++; continue; }
    if (existing.has(m.id)) { skipped++; continue; }
    const keptIds: string[] = [];
    for (const pid of m.photoIds) {
      const data = photoMap[pid];
      if (typeof data !== 'string' || data.length > MAX_PHOTO_CHARS || !PHOTO_DATA_URL.test(data)) continue;
      const blob = dataURLToBlob(data);
      if (!blob) continue;
      await tx.objectStore('photos').put({ id: pid, memoryId: m.id, blob } satisfies PhotoRecord);
      keptIds.push(pid);
    }
    await tx.objectStore('memories').put({ ...m, photoIds: keptIds });
    added++;
  }
  const by = f.settings?.birth_year;
  if (typeof by === 'number' && !(await tx.objectStore('settings').get('birth_year'))) {
    await tx.objectStore('settings').put(by, 'birth_year');
  }
  await tx.done;
  return { added, skipped, invalid };
}
