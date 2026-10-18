// 시군구 경계 GeoJSON을 앱이 바로 그릴 수 있는 SVG 경로 목록(public/regions.json)으로 바꿔요.
// 사용: node scripts/build-regions.mjs <skorea_municipalities_geo_simple.json 경로>
// 원본: https://github.com/southkorea/southkorea-maps (kostat 2013, simple)
//
// 지역 코드는 저장된 추억이 참조하므로 절대 바꾸지 않아요. 이름·소속만 보정해요.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('GeoJSON 경로를 넘겨주세요');
  process.exit(1);
}
const geo = JSON.parse(readFileSync(src, 'utf8'));

// 등거리 원통 투영 + 위도 36°의 코사인 보정 (남북으로 늘어나 보이지 않게)
const BOUNDS = { minLng: 124.55, maxLng: 131.95, minLat: 33.05, maxLat: 38.65 };
const K = Math.cos((36 * Math.PI) / 180);
const WIDTH = 1000;
const SCALE = WIDTH / ((BOUNDS.maxLng - BOUNDS.minLng) * K);
const HEIGHT = Math.round((BOUNDS.maxLat - BOUNDS.minLat) * SCALE);

const px = (lng) => (lng - BOUNDS.minLng) * K * SCALE;
const py = (lat) => (BOUNDS.maxLat - lat) * SCALE;

// 2013년 이후 행정구역 변경 중 코드 유지로 반영할 수 있는 것
const PROVINCE_OVERRIDE = {
  '37310': '22', // 군위군: 2023년 경북 → 대구 편입
};

function ring(r, box) {
  let d = '';
  let last = '';
  r.forEach(([lng, lat], i) => {
    const x = px(lng), y = py(lat);
    box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
    const pt = `${x.toFixed(1)},${y.toFixed(1)}`;
    if (pt === last) return;
    d += (i === 0 ? 'M' : 'L') + pt;
    last = pt;
  });
  return d + 'Z';
}

// '용인시수지구' → '용인시 수지구'
const prettyName = (n) => n.replace(/^(.+?시)(.+구)$/, '$1 $2');

const regions = geo.features.map((f) => {
  const { code, name } = f.properties;
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const path = polys.map((p) => p.map((r) => ring(r, box)).join('')).join('');
  return {
    code,
    name: prettyName(name),
    prov: PROVINCE_OVERRIDE[code] ?? code.slice(0, 2),
    path,
    box: box.map((v) => Math.round(v)),
  };
});

writeFileSync(
  new URL('../public/regions.json', import.meta.url),
  JSON.stringify({ width: WIDTH, height: HEIGHT, regions }),
);
console.log(`${regions.length}개 지역, ${WIDTH}×${HEIGHT}`);
