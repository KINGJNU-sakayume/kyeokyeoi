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
  source?: SourceReference;
  relatedMemoryIds?: string[];
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

/** Optional provenance for a future explicit, user-confirmed import. No network dependency. */
export interface SourceReference {
  service: string;
  originalId: string;
  revision: number;
  certainty: 'confirmed' | 'inferred';
  url?: string;
}
export interface RegionVisit {
  id: string;
  regionCode: string;
  regionLabel: string;
  visitedOn: string | null;
  recordedAt: number;
  updatedAt: number;
  source?: SourceReference;
}
export interface MemoryCollection {
  id: string;
  title: string;
  memoryIds: string[];
  createdAt: number;
  updatedAt: number;
}
export interface LifePeriod extends MemoryCollection {
  startYear: number | null;
  endYear: number | null;
}
