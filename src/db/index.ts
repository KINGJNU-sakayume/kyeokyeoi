import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb';

export interface Memory {
  id: string;
  title: string;
  regionCode: string | null;
  regionLabel: string | null;
  timeType: 'date' | 'month' | 'year' | 'season' | 'age' | 'grade' | 'free' | null;
  timeValue: {
    year?: number;
    month?: number;
    day?: number;
    season?: 'spring' | 'summer' | 'autumn' | 'winter';
    age?: number;
    schoolType?: 'elementary' | 'middle' | 'high';
    schoolGrade?: number;
    freeText?: string;
  } | null;
  computedYear: number | null;
  emotions: string[];
  song: { artist: string; title: string } | null;
  photos: string[];
  memo: string | null;
  isFirst: boolean;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export type SettingKey = 'birth_year' | 'app_theme' | 'onboarding_done';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB('kkyeokyeoi-db', 1, {
      upgrade(db) {
        const memories = db.createObjectStore('memories', { keyPath: 'id' });
        memories.createIndex('by-region', 'regionCode');
        memories.createIndex('by-year', 'computedYear');
        db.createObjectStore('settings');
      },
    });
  }
  return dbPromise;
}

export async function getMemories(): Promise<Memory[]> {
  try {
    const db = await getDb();
    return db.getAll('memories');
  } catch (e) {
    console.error('[DB] getMemories failed', e);
    return [];
  }
}

export async function getMemory(id: string): Promise<Memory | undefined> {
  try {
    const db = await getDb();
    return db.get('memories', id);
  } catch (e) {
    console.error('[DB] getMemory failed', e);
    return undefined;
  }
}

export async function saveMemory(memory: Memory): Promise<void> {
  try {
    const db = await getDb();
    await db.put('memories', memory);
    checkStorageWarning();
  } catch (e) {
    console.error('[DB] saveMemory failed', e);
    throw e;
  }
}

export async function deleteMemory(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete('memories', id);
  } catch (e) {
    console.error('[DB] deleteMemory failed', e);
    throw e;
  }
}

export async function getSetting<T>(key: SettingKey): Promise<T | undefined> {
  try {
    const db = await getDb();
    return db.get('settings', key);
  } catch (e) {
    console.error('[DB] getSetting failed', e);
    return undefined;
  }
}

export async function setSetting<T>(key: SettingKey, value: T): Promise<void> {
  try {
    const db = await getDb();
    await db.put('settings', value, key);
  } catch (e) {
    console.error('[DB] setSetting failed', e);
    throw e;
  }
}

async function checkStorageWarning(): Promise<void> {
  try {
    const memories = await getMemories();
    const totalSize = memories.reduce((acc, m) => {
      const photoSize = m.photos.reduce((sum, p) => sum + p.length, 0);
      return acc + photoSize;
    }, 0);
    const estimatedMB = (totalSize * 0.75) / (1024 * 1024);
    if (estimatedMB > 50) {
      console.warn(`[켜켜이] 저장 용량이 ${estimatedMB.toFixed(1)}MB를 초과했습니다. 사진 데이터가 많습니다.`);
    }
  } catch {
    // ignore
  }
}
