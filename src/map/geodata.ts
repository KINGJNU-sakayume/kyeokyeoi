export interface RegionData {
  code: string;
  name: string;
  path: string;
  // Province (si/do) for grouping
  province?: string;
}

// GeoJSON bounds for South Korea: lng 124.6–131.9, lat 33.1–38.6
const BOUNDS = {
  minLng: 124.6,
  maxLng: 131.9,
  minLat: 33.1,
  maxLat: 38.6,
};

export const SVG_WIDTH = 400;
export const SVG_HEIGHT = 500;

function projectLng(lng: number): number {
  return ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * SVG_WIDTH;
}

function projectLat(lat: number): number {
  // Invert Y axis (SVG Y increases downward)
  return ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * SVG_HEIGHT;
}

function ringToPath(ring: number[][]): string {
  return ring
    .map(([lng, lat], i) => `${i === 0 ? 'M' : 'L'}${projectLng(lng).toFixed(2)},${projectLat(lat).toFixed(2)}`)
    .join(' ') + ' Z';
}

function geometryToPath(geometry: { type: string; coordinates: unknown }): string {
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as number[][][];
    return coords.map(ring => ringToPath(ring)).join(' ');
  } else if (geometry.type === 'MultiPolygon') {
    const coords = geometry.coordinates as number[][][][];
    return coords.flatMap(poly => poly.map(ring => ringToPath(ring))).join(' ');
  }
  return '';
}

// Province code prefix mapping (first 2 digits of code)
const PROVINCE_MAP: Record<string, string> = {
  '11': '서울특별시',
  '21': '부산광역시',
  '22': '대구광역시',
  '23': '인천광역시',
  '24': '광주광역시',
  '25': '대전광역시',
  '26': '울산광역시',
  '29': '세종특별자치시',
  '31': '경기도',
  '32': '강원특별자치도',  // 2023년 개정
  '33': '충청북도',
  '34': '충청남도',
  '35': '전북특별자치도',  // 2024년 개정
  '36': '전라남도',
  '37': '경상북도',
  '38': '경상남도',
  '39': '제주특별자치도',
};

// Standard abbreviated display names for each province
export const PROVINCE_ABBR: Record<string, string> = {
  '서울특별시':   '서울',
  '부산광역시':   '부산',
  '대구광역시':   '대구',
  '인천광역시':   '인천',
  '광주광역시':   '광주',
  '대전광역시':   '대전',
  '울산광역시':   '울산',
  '세종특별자치시': '세종',
  '경기도':       '경기',
  '강원특별자치도': '강원',
  '충청북도':     '충북',
  '충청남도':     '충남',
  '전북특별자치도': '전북',
  '전라남도':     '전남',
  '경상북도':     '경북',
  '경상남도':     '경남',
  '제주특별자치도': '제주',
};

// Administrative hierarchy order (official Korean ordering)
const PROVINCE_ORDER = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시',
  '대전광역시', '울산광역시', '세종특별자치시', '경기도', '강원특별자치도',
  '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
];

function getProvince(code: string): string {
  // Code is 5-digit; first 2 digits map to province
  const prefix = code.substring(0, 2);
  return PROVINCE_MAP[prefix] ?? '기타';
}

const GEOJSON_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea_municipalities_geo_simple.json';

const CACHE_KEY = 'geodata-cache-v1';

let cachedRegions: RegionData[] | null = null;

export async function loadRegions(): Promise<RegionData[]> {
  if (cachedRegions) return cachedRegions;

  // 1. Try bundled local file first (place at public/geodata.json for offline support)
  try {
    const localRes = await fetch('/geodata.json');
    if (localRes.ok) {
      const geojson = await localRes.json();
      cachedRegions = parseGeoJSON(geojson);
      return cachedRegions;
    }
  } catch {
    // Local file not present — fall through to cache/network
  }

  // 2. Try localStorage cache (avoids network on repeat visits)
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      cachedRegions = JSON.parse(cached) as RegionData[];
      return cachedRegions;
    }
  } catch {
    // ignore cache errors
  }

  // 3. Fetch from network
  try {
    const response = await fetch(GEOJSON_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();
    cachedRegions = parseGeoJSON(geojson);

    // Cache in localStorage for next visit
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cachedRegions));
    } catch {
      // Storage might be full; continue without caching
    }

    return cachedRegions;
  } catch (e) {
    console.error('[geodata] Failed to load GeoJSON:', e);
    return [];
  }
}

function parseGeoJSON(geojson: {
  features: Array<{
    properties: { code: string; name: string };
    geometry: { type: string; coordinates: unknown };
  }>;
}): RegionData[] {
  return geojson.features.map(feature => ({
    code: feature.properties.code,
    name: feature.properties.name,
    path: geometryToPath(feature.geometry),
    province: getProvince(feature.properties.code),
  }));
}

export function getRegionByCode(code: string, regions: RegionData[]): RegionData | undefined {
  return regions.find(r => r.code === code);
}

export function getProvinces(regions: RegionData[]): string[] {
  const available = new Set(regions.map(r => r.province ?? '').filter(Boolean));
  return PROVINCE_ORDER.filter(p => available.has(p));
}

export function getRegionsByProvince(province: string, regions: RegionData[]): RegionData[] {
  return regions.filter(r => r.province === province);
}
