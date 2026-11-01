import type { LifePeriod, Memory } from '../db';
export function inPeriod(memory: Memory, period: LifePeriod): boolean {
  if (period.memoryIds.includes(memory.id)) return true;
  if (memory.timeType === 'free' || memory.computedYear == null || (period.startYear === null && period.endYear === null)) return false;
  return (period.startYear === null || memory.computedYear >= period.startYear) && (period.endYear === null || memory.computedYear <= period.endYear);
}
export function lifeStage(memory: Memory): 'childhood' | 'school' | 'other' {
  if (memory.timeType === 'grade') return 'school';
  if (memory.timeType === 'age' && memory.timeValue?.age != null && memory.timeValue.age < 8) return 'childhood';
  return 'other';
}
export function experienceSort(a: Memory, b: Memory): number {
  const year = (m: Memory) => m.timeType === 'free' ? null : m.computedYear;
  return (year(b) ?? -Infinity) - (year(a) ?? -Infinity) || b.createdAt - a.createdAt;
}
