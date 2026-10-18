import type { Memory } from '../db/index';

export function getVisitCounts(memories: Memory[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of memories) {
    if (m.regionCode) counts.set(m.regionCode, (counts.get(m.regionCode) ?? 0) + 1);
  }
  return counts;
}

export function getMemoriesByRegion(regionCode: string, memories: Memory[]): Memory[] {
  return memories.filter(m => m.regionCode === regionCode);
}

/** 추억 개수 → 지도 색 단계 (CSS 변수) */
export function heatFill(count: number): string {
  if (count <= 0) return 'var(--land)';
  if (count === 1) return 'var(--heat-1)';
  if (count <= 3) return 'var(--heat-2)';
  if (count <= 7) return 'var(--heat-3)';
  return 'var(--heat-4)';
}
