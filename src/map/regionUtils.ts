import type { Memory } from '../db/index';

export function getVisitCounts(memories: Memory[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of memories) {
    if (m.regionCode) {
      counts.set(m.regionCode, (counts.get(m.regionCode) ?? 0) + 1);
    }
  }
  return counts;
}

export function getMemoriesByRegion(regionCode: string, memories: Memory[]): Memory[] {
  return memories.filter(m => m.regionCode === regionCode);
}

export function getVisitedRegionCount(memories: Memory[]): number {
  return new Set(memories.filter(m => m.regionCode).map(m => m.regionCode)).size;
}

export function getCoveragePercent(visitedCount: number, totalRegions: number): number {
  if (totalRegions === 0) return 0;
  return Math.round((visitedCount / totalRegions) * 100);
}
