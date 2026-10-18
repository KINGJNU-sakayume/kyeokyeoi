import type { Memory } from '../db/index';

export type SeasonKo = '봄' | '여름' | '가을' | '겨울';

const SEASON_KO: Record<string, SeasonKo> = {
  spring: '봄',
  summer: '여름',
  autumn: '가을',
  winter: '겨울',
};

const SCHOOL_KO: Record<string, string> = {
  elementary: '초등학교',
  middle: '중학교',
  high: '고등학교',
};

// School start age (Korean age) and grade count
const SCHOOL_START_AGE: Record<string, number> = {
  elementary: 8,  // Korean age 8 = grade 1
  middle: 14,
  high: 17,
};

export function computeYear(
  timeType: Memory['timeType'],
  timeValue: Memory['timeValue'],
  birthYear: number | null
): number | null {
  if (!timeType || !timeValue) return null;

  switch (timeType) {
    case 'date':
    case 'month':
    case 'year':
    case 'season':
      return timeValue.year ?? null;

    case 'age': {
      if (birthYear == null || timeValue.age == null) return null;
      return birthYear + timeValue.age - 1;
    }

    case 'grade': {
      if (birthYear == null || !timeValue.schoolType || timeValue.schoolGrade == null) return null;
      const startAge = SCHOOL_START_AGE[timeValue.schoolType];
      const koreanAge = startAge + (timeValue.schoolGrade - 1);
      return birthYear + koreanAge - 1;
    }

    case 'free':
      return null;

    default:
      return null;
  }
}

export function formatTimeDisplay(memory: Pick<Memory, 'timeType' | 'timeValue' | 'computedYear'>): string {
  const { timeType, timeValue } = memory;
  if (!timeType || !timeValue) return '';

  switch (timeType) {
    case 'date': {
      const { year, month, day } = timeValue;
      if (year && month && day) return `${year}년 ${month}월 ${day}일`;
      if (year && month) return `${year}년 ${month}월`;
      return year ? `${year}년` : '';
    }
    case 'month':
      return timeValue.year && timeValue.month ? `${timeValue.year}년 ${timeValue.month}월` : '';
    case 'year':
      return timeValue.year ? `${timeValue.year}년` : '';
    case 'season': {
      const seasonKo = timeValue.season ? SEASON_KO[timeValue.season] : '';
      return timeValue.year && seasonKo ? `${timeValue.year}년 ${seasonKo}` : '';
    }
    case 'age': {
      const yr = memory.computedYear;
      return timeValue.age != null
        ? `${timeValue.age}살 때${yr ? ` (${yr}년)` : ''}`
        : '';
    }
    case 'grade': {
      const schoolKo = timeValue.schoolType ? SCHOOL_KO[timeValue.schoolType] : '';
      return schoolKo && timeValue.schoolGrade != null
        ? `${schoolKo} ${timeValue.schoolGrade}학년 때`
        : '';
    }
    case 'free':
      return timeValue.freeText ?? '';
    default:
      return '';
  }
}

export interface TimelineGroup {
  year: number | null;
  isMemorySection: boolean; // true = "기억 속" section
  memories: Memory[];
}

export function sortMemories(memories: Memory[]): TimelineGroup[] {
  const memoriesSection: Memory[] = [];
  const yearMap = new Map<number, Memory[]>();

  for (const m of memories) {
    if (m.timeType === 'free' || m.timeType === null) {
      memoriesSection.push(m);
      continue;
    }
    const year = m.computedYear;
    if (year == null) {
      memoriesSection.push(m);
      continue;
    }
    if (!yearMap.has(year)) yearMap.set(year, []);
    yearMap.get(year)!.push(m);
  }

  // 한 해 안에서는 늦은 때가 위로 (날짜 > 달 > 계절 순으로 추정), 때를 모르면 아래로
  const byRecent = (a: Memory, b: Memory) => getIntraYearKey(b) - getIntraYearKey(a) || b.createdAt - a.createdAt;
  for (const [, group] of yearMap) group.sort(byRecent);
  memoriesSection.sort((a, b) => b.createdAt - a.createdAt);

  // Build result: years descending
  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b - a);
  const groups: TimelineGroup[] = sortedYears.map(year => ({
    year,
    isMemorySection: false,
    memories: yearMap.get(year)!,
  }));

  // Add "기억 속" section at bottom
  if (memoriesSection.length > 0) {
    groups.push({ year: null, isMemorySection: true, memories: memoriesSection });
  }

  return groups;
}

const SEASON_MID_MONTH: Record<string, number> = { spring: 4, summer: 7, autumn: 10, winter: 12 };

/** 한 해 안에서의 대략적인 위치 (월 단위, 모르면 -1) */
function getIntraYearKey(memory: Memory): number {
  const { timeType, timeValue } = memory;
  if ((timeType === 'date' || timeType === 'month') && timeValue?.month) {
    return timeValue.month + (timeValue.day ? timeValue.day / 100 : 0);
  }
  if (timeType === 'season' && timeValue?.season) return SEASON_MID_MONTH[timeValue.season] - 0.5;
  return -1;
}
