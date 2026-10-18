import { useEffect, useState } from 'react';

export interface RegionData {
  code: string;
  name: string;
  /** 시·도 코드 앞 두 자리 (군위군처럼 편입된 곳은 보정된 값) */
  prov: string;
  path: string;
  /** [minX, minY, maxX, maxY] */
  box: [number, number, number, number];
}

export interface RegionSet {
  width: number;
  height: number;
  regions: RegionData[];
  byCode: Map<string, RegionData>;
}

export const PROVINCES: { code: string; name: string; short: string }[] = [
  { code: '11', name: '서울특별시', short: '서울' },
  { code: '21', name: '부산광역시', short: '부산' },
  { code: '22', name: '대구광역시', short: '대구' },
  { code: '23', name: '인천광역시', short: '인천' },
  { code: '24', name: '광주광역시', short: '광주' },
  { code: '25', name: '대전광역시', short: '대전' },
  { code: '26', name: '울산광역시', short: '울산' },
  { code: '29', name: '세종특별자치시', short: '세종' },
  { code: '31', name: '경기도', short: '경기' },
  { code: '32', name: '강원특별자치도', short: '강원' },
  { code: '33', name: '충청북도', short: '충북' },
  { code: '34', name: '충청남도', short: '충남' },
  { code: '35', name: '전북특별자치도', short: '전북' },
  { code: '36', name: '전라남도', short: '전남' },
  { code: '37', name: '경상북도', short: '경북' },
  { code: '38', name: '경상남도', short: '경남' },
  { code: '39', name: '제주특별자치도', short: '제주' },
];
const PROVINCE_BY_CODE = new Map(PROVINCES.map(p => [p.code, p]));

let cached: RegionSet | null = null;
let pending: Promise<RegionSet | null> | null = null;

/** 앱과 함께 배포되는 regions.json을 읽어요 (오프라인에서도 서비스 워커 캐시로 열려요). */
export function loadRegions(): Promise<RegionSet | null> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}regions.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { width: number; height: number; regions: RegionData[] }) => {
        cached = { ...data, byCode: new Map(data.regions.map(r => [r.code, r])) };
        return cached;
      })
      .catch(e => {
        console.error('[지도] regions.json을 읽지 못했어요', e);
        pending = null;
        return null;
      });
  }
  return pending;
}

export function useRegions(): RegionSet | null | undefined {
  // undefined = 읽는 중, null = 실패
  const [set, setSet] = useState<RegionSet | null | undefined>(cached ?? undefined);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    loadRegions().then(s => { if (alive) setSet(s); });
    return () => { alive = false; };
  }, []);
  return set;
}

export function provinceOf(region: RegionData) {
  return PROVINCE_BY_CODE.get(region.prov);
}

/** '서울 강남구', 세종은 '세종특별자치시' */
export function regionLabel(region: RegionData): string {
  if (region.prov === '29') return '세종특별자치시';
  const p = provinceOf(region);
  return p ? `${p.short} ${region.name}` : region.name;
}

/** 저장된 추억의 지역 표시. 지도 데이터가 있으면 최신 이름으로, 없으면 저장된 이름으로. */
export function displayRegion(code: string | null, stored: string | null, set: RegionSet | null | undefined): string | null {
  if (code && set) {
    const r = set.byCode.get(code);
    if (r) return regionLabel(r);
  }
  return stored;
}

export function regionsInProvince(set: RegionSet, prov: string): RegionData[] {
  return set.regions
    .filter(r => r.prov === prov)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export function unionBox(regions: RegionData[]): [number, number, number, number] | null {
  if (regions.length === 0) return null;
  return regions.reduce<[number, number, number, number]>(
    (acc, r) => [Math.min(acc[0], r.box[0]), Math.min(acc[1], r.box[1]), Math.max(acc[2], r.box[2]), Math.max(acc[3], r.box[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}
