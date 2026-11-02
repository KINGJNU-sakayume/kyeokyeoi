/**
 * Saving what the owner already approved in a Claude card (Life Hub P4 stage 2).
 *
 * Only when everything 켜켜이 needs is certain: an approved proposal with no last check requested, the
 * auto-apply setting on, and — when a place is involved — a 시군구 that is exactly one region label (the
 * labels 켜켜이 shares with Life Hub for the card picker). Anything else stays a proposal for the owner.
 * Saves carry the Life Hub source in the same transaction, so a retry never makes a second record.
 */
import type { Memory } from '../db/model';
import { computeYear } from '../utils/timeUtils';
import { memoryPrefill, type Proposal, type RegionRef } from './lifehub';

export interface RegionEntry {
  code: string;
  label: string;
}

/** The exact region for a card-chosen label, or null (no guessing from partial names). */
export function exactRegion(label: string | undefined, regions: RegionEntry[]): RegionEntry | null {
  if (!label) return null;
  const wanted = label.trim();
  const hits = regions.filter((r) => r.label === wanted);
  return hits.length === 1 ? hits[0] : null;
}

export type AutoPlan =
  | { kind: 'memory'; key: string; memory: Omit<Memory, 'id' | 'createdAt' | 'updatedAt'> }
  | { kind: 'visit'; key: string; region: RegionEntry; visitedOn: string | null };

/** What may be saved without asking, or null when the owner should finish it in 켜켜이. */
export function planAutoApply(p: Proposal, regions: RegionEntry[], birthYear: number | null): AutoPlan | null {
  if (p.status !== 'approved' || p.needsAppReview) return null;
  if (p.type === 'visit') {
    const region = exactRegion(p.payload.region_hint, regions);
    return region ? { kind: 'visit', key: p.key, region, visitedOn: p.payload.visited_on ?? null } : null;
  }
  const pre = memoryPrefill(p.payload);
  let region: RegionEntry | null = null;
  if (p.payload.region_hint) {
    region = exactRegion(p.payload.region_hint, regions);
    if (!region) return null;
  } else if (p.payload.place_text) return null; // a place with no 시군구 chosen: 켜켜이 asks
  return {
    kind: 'memory',
    key: p.key,
    memory: {
      title: pre.title,
      regionCode: region?.code ?? null,
      regionLabel: region?.label ?? null,
      timeType: pre.timeType,
      timeValue: pre.timeValue,
      computedYear: computeYear(pre.timeType, pre.timeValue, birthYear),
      emotions: pre.emotions,
      song: pre.songArtist || pre.songTitle ? { artist: pre.songArtist, title: pre.songTitle } : null,
      photoIds: [],
      memo: pre.memo || null,
      isFirst: false,
      isPublic: false,
    },
  };
}

/** The refs list for Life Hub from the app's region data. */
export function regionRefs(regions: RegionEntry[], groupOf: (code: string) => string): RegionRef[] {
  return regions.map((r) => ({ id: r.code, label: r.label, group: groupOf(r.code) }));
}
