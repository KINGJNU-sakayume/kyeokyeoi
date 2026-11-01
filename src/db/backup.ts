import type { Memory, PhotoRecord, RegionVisit, MemoryCollection, LifePeriod } from './model';
import type { Repository, Snapshot } from './index';

export const BACKUP_VERSION = 3;
export interface BackupPayload {
  regionVisits: RegionVisit[];
  collections: MemoryCollection[];
  lifePeriods: LifePeriod[];
  memories: Memory[];
  photos: Record<string, string>;
  photoOwners: Record<string, string>;
  settings: Record<string, unknown>;
}
export interface BackupFile extends BackupPayload {
  app: 'kyeokyeoi';
  version: 3;
  exportedAt: string;
  integrity: { algorithm: 'SHA-256'; digest: string };
}
export interface ImportReport {
  added: number;
  skipped: number;
  invalid: number;
  conflicts: number;
  missingPhotos: number;
  visitsAdded: number;
  collectionsAdded: number;
  periodsAdded: number;
  issues: string[];
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
export function decodePhoto(data: string): Blob | null {
  if (typeof data !== 'string') return null;
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(data);
  if (!m) return null;
  try {
    const body = m[2]
      ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(m[3]));
    return new Blob([body], { type: m[1] || 'application/octet-stream' });
  } catch {
    return null;
  }
}
export async function encodePhoto(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}
export async function serializeBackup(snapshot: Snapshot) {
  const photos: Record<string, string> = Object.create(null);
  const photoOwners: Record<string, string> = Object.create(null);
  for (const p of snapshot.photos) {
    photos[p.id] = await encodePhoto(p.blob);
    photoOwners[p.id] = p.memoryId;
  }
  const payload: BackupPayload = {
    memories: snapshot.memories,
    photos,
    photoOwners,
    settings: snapshot.settings,
    regionVisits: snapshot.regionVisits,
    collections: snapshot.collections,
    lifePeriods: snapshot.lifePeriods,
  };
  const missingPhotos = payload.memories.reduce(
    (n, m) => n + m.photoIds.filter((id) => !photos[id] || photoOwners[id] !== m.id).length,
    0,
  );
  return {
    file: {
      app: 'kyeokyeoi',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      ...payload,
      integrity: { algorithm: 'SHA-256', digest: await digest(payload) },
    } satisfies BackupFile,
    missingPhotos,
  };
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
function validMemory(m: unknown): m is Memory {
  return (
    object(m) &&
    typeof m.id === 'string' &&
    !!m.id &&
    typeof m.title === 'string' &&
    !!m.title.trim() &&
    strings(m.photoIds) &&
    strings(m.emotions) &&
    Number.isFinite(m.createdAt) &&
    Number.isFinite(m.updatedAt) &&
    (m.timeType === null ||
      ['date', 'month', 'year', 'season', 'age', 'grade', 'free'].includes(String(m.timeType))) &&
    (m.timeValue === null || object(m.timeValue)) &&
    (m.computedYear === null || Number.isFinite(m.computedYear)) &&
    (m.regionCode === null || typeof m.regionCode === 'string') &&
    (m.regionLabel === null || typeof m.regionLabel === 'string') &&
    (m.memo === null || typeof m.memo === 'string') &&
    typeof m.isFirst === 'boolean' &&
    typeof m.isPublic === 'boolean' &&
    (m.song === null ||
      (object(m.song) && typeof m.song.artist === 'string' && typeof m.song.title === 'string'))
  );
}
export async function validateBackup(json: unknown): Promise<BackupPayload> {
  if (
    !object(json) ||
    json.app !== 'kyeokyeoi' ||
    ![2, 3].includes(Number(json.version)) ||
    !Array.isArray(json.memories)
  )
    throw new Error('지원하는 켜켜이 백업 파일이 아니에요.');
  if (!object(json.photos) || !object(json.settings))
    throw new Error('사진 또는 설정 데이터가 손상됐어요.');
  const memories = json.memories as Memory[];
  const photoOwners: Record<string, string> = Object.create(null);
  for (const m of memories)
    if (validMemory(m))
      for (const id of m.photoIds) {
        if (photoOwners[id] && photoOwners[id] !== m.id)
          throw new Error(`사진 참조가 여러 기억에 중복되어 있어요: ${id}`);
        photoOwners[id] = m.id;
      }
  const payload = {
    regionVisits: (json.version === 3 ? json.regionVisits : []) as RegionVisit[],
    collections: (json.version === 3 ? json.collections : []) as MemoryCollection[],
    lifePeriods: (json.version === 3 ? json.lifePeriods : []) as LifePeriod[],
    memories,
    photos: json.photos as Record<string, string>,
    photoOwners:
      json.version === 3 && object(json.photoOwners)
        ? (json.photoOwners as Record<string, string>)
        : photoOwners,
    settings: json.settings,
  };
  if (
    json.version === 3 &&
    (!object(json.integrity) ||
      json.integrity.algorithm !== 'SHA-256' ||
      json.integrity.digest !== (await digest(payload)))
  )
    throw new Error('백업 무결성 검증에 실패했어요. 어떤 기록도 변경하지 않았어요.');
  return payload;
}

/** Preparation is read-only; conflicts never overwrite existing records. Writes commit together. */
export async function mergeBackup(json: unknown, repo: Repository): Promise<ImportReport> {
  const payload = await validateBackup(json);
  const report: ImportReport = {
    added: 0,
    skipped: 0,
    invalid: 0,
    conflicts: 0,
    missingPhotos: 0,
    visitsAdded: 0,
    collectionsAdded: 0,
    periodsAdded: 0,
    issues: [],
  };
  const unique = new Map<string, Memory>();
  for (const raw of payload.memories) {
    if (!validMemory(raw)) {
      report.invalid++;
      report.issues.push('형식이 손상된 기억을 건너뛰었어요.');
      continue;
    }
    const prior = unique.get(raw.id);
    if (prior) {
      if (canonical(prior) !== canonical(raw))
        throw new Error(
          `백업 안의 기억 ID가 서로 다른 내용으로 중복됐어요: ${raw.id}. 가져오기를 중단했어요.`,
        );
      report.skipped++;
      continue;
    }
    unique.set(raw.id, raw);
  }
  const decoded = new Map<string, PhotoRecord>();
  for (const [id, data] of Object.entries(payload.photos)) {
    const blob =
      typeof data === 'string' && data.length <= 12 * 1024 * 1024 ? decodePhoto(data) : null;
    if (
      !blob ||
      !/^image\/(png|jpeg|webp|gif|avif)$/.test(blob.type) ||
      typeof payload.photoOwners[id] !== 'string'
    ) {
      report.invalid++;
      report.issues.push(`사진을 읽지 못했어요: ${id}. 원래 참조는 유지해요.`);
      continue;
    }
    decoded.set(id, { id, memoryId: payload.photoOwners[id], blob });
  }
  const before = await repo.snapshot();
  const existingPhotos = new Map<string, { record: PhotoRecord; data: string }>();
  for (const p of before.photos)
    existingPhotos.set(p.id, { record: p, data: await encodePhoto(p.blob) });
  const db = await repo.getDb();
  const extras = [
    ['regionVisits', payload.regionVisits, 'regionCode', 'visitsAdded'],
    ['collections', payload.collections, 'id', 'collectionsAdded'],
    ['lifePeriods', payload.lifePeriods, 'id', 'periodsAdded'],
  ] as const;
  for (const [store, records, key] of extras) {
    if (!Array.isArray(records)) throw new Error(`백업 저장소가 손상됐어요: ${store}`);
    const seen = new Map<string, unknown>();
    for (const raw of records) {
      if (
        !object(raw) ||
        typeof raw[key] !== 'string' ||
        typeof raw.id !== 'string' ||
        !Number.isFinite(raw.updatedAt) ||
        (store === 'regionVisits'
          ? typeof raw.regionLabel !== 'string' ||
            !Number.isFinite(raw.recordedAt) ||
            !(raw.visitedOn === null || typeof raw.visitedOn === 'string')
          : typeof raw.title !== 'string' ||
            !strings(raw.memoryIds) ||
            !Number.isFinite(raw.createdAt)) ||
        (store === 'lifePeriods' &&
          !(
            (raw.startYear === null || Number.isFinite(raw.startYear)) &&
            (raw.endYear === null || Number.isFinite(raw.endYear))
          ))
      )
        throw new Error(`백업 항목이 손상됐어요: ${store}`);
      const id = String(raw[key]);
      if (seen.has(id) && canonical(seen.get(id)) !== canonical(raw))
        throw new Error(`백업 안의 ID가 중복됐어요: ${id}`);
      seen.set(id, raw);
    }
  }
  const tx = db.transaction(
    ['memories', 'photos', 'settings', 'regionVisits', 'collections', 'lifePeriods'],
    'readwrite',
  );
  try {
    for (const m of unique.values()) {
      const existing = await tx.objectStore('memories').get(m.id);
      if (existing) {
        report.skipped++;
        if (canonical(existing) !== canonical(m)) {
          report.conflicts++;
          report.issues.push(`같은 ID의 다른 기억은 덮어쓰지 않았어요: ${m.id}`);
        } else
          for (const id of m.photoIds) {
            const incoming = decoded.get(id);
            const current: PhotoRecord | undefined = await tx.objectStore('photos').get(id);
            if (incoming && incoming.memoryId === m.id && !current)
              await tx.objectStore('photos').add(incoming);
            else if (
              current &&
              incoming &&
              (current.memoryId !== m.id || existingPhotos.get(id)?.data !== payload.photos[id])
            ) {
              report.conflicts++;
              report.issues.push(`같은 기억의 사진 내용이 달라 기존 사진을 유지했어요: ${id}`);
            } else if (!current && !incoming) {
              report.missingPhotos++;
              report.issues.push(`누락 사진 참조 유지: ${m.id} / ${id}`);
            }
          }
        continue;
      }
      let collision = false;
      for (const id of m.photoIds) {
        const incoming = decoded.get(id);
        const current: PhotoRecord | undefined = await tx.objectStore('photos').get(id);
        if (incoming && incoming.memoryId !== m.id) {
          collision = true;
          report.issues.push(`사진 소유 관계 불일치: ${id}`);
        }
        if (current) {
          const previous = existingPhotos.get(id);
          if (
            !previous ||
            current.memoryId !== m.id ||
            previous.data !== payload.photos[id] ||
            current.blob.size !== previous.record.blob.size ||
            current.blob.type !== previous.record.blob.type
          ) {
            collision = true;
            report.issues.push(`사진 ID 충돌: ${id}`);
          }
        }
        if (!incoming) {
          report.missingPhotos++;
          report.issues.push(`누락 사진: ${m.id} / ${id}. 참조는 보존했어요.`);
        }
      }
      if (collision) {
        report.conflicts++;
        report.skipped++;
        continue;
      }
      await tx.objectStore('memories').add(m);
      for (const id of m.photoIds) {
        const p = decoded.get(id);
        if (p && !(await tx.objectStore('photos').get(id))) await tx.objectStore('photos').add(p);
      }
      report.added++;
    }
    // Also preserve orphan blobs for recovery, without overwriting any existing photo.
    for (const [id, p] of decoded)
      if (!unique.has(p.memoryId) && !(await tx.objectStore('photos').get(id))) {
        await tx.objectStore('photos').add(p);
        report.issues.push(`기억과 연결되지 않은 사진을 보존했어요: ${id}`);
      }
    for (const [key, value] of Object.entries(payload.settings)) {
      const existing = await tx.objectStore('settings').get(key);
      if (existing === undefined) await tx.objectStore('settings').put(value, key);
      else if (canonical(existing) !== canonical(value))
        report.issues.push(`현재 설정을 유지했어요: ${key}`);
    }
    for (const [store, records, key, counter] of extras)
      for (const record of records) {
        const existing = await tx
          .objectStore(store)
          .get(record[key as keyof typeof record] as string);
        if (!existing) {
          await tx.objectStore(store).add(record);
          report[counter]++;
        } else if (canonical(existing) !== canonical(record)) {
          report.conflicts++;
          report.issues.push(`기존 데이터를 유지했어요: ${store} / ${record.id}`);
        }
      }
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
  return report;
}
