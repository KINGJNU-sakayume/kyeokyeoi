import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchRegion } from '../src/map/regionMatch';

const regions = (JSON.parse(readFileSync(new URL('../public/regions.json', import.meta.url), 'utf8')) as {
  regions: { code: string; name: string; prov: string }[];
}).regions;
// Same list as src/map/geodata.ts PROVINCES (kept here so the test does not load React).
const provinces = [
  ['11', '서울특별시', '서울'], ['21', '부산광역시', '부산'], ['22', '대구광역시', '대구'], ['23', '인천광역시', '인천'],
  ['24', '광주광역시', '광주'], ['25', '대전광역시', '대전'], ['26', '울산광역시', '울산'], ['29', '세종특별자치시', '세종'],
  ['31', '경기도', '경기'], ['32', '강원특별자치도', '강원'], ['33', '충청북도', '충북'], ['34', '충청남도', '충남'],
  ['35', '전북특별자치도', '전북'], ['36', '전라남도', '전남'], ['37', '경상북도', '경북'], ['38', '경상남도', '경남'],
  ['39', '제주특별자치도', '제주'],
].map(([code, name, short]) => ({ code, name, short }));
const match = (hint: string) => matchRegion(hint, regions, provinces)?.code ?? null;

describe('region hint matching', () => {
  it('resolves an exact 시군구 written in common ways', () => {
    for (const hint of ['경기 고양시 일산서구', '경기도 고양시 일산서구', '고양시 일산서구', '경기 고양시 일산서구 대화동'])
      assert.equal(match(hint), '31104', hint);
    assert.equal(match('부산 해운대구'), '21090');
    assert.equal(match('해운대구'), '21090');
    assert.equal(match('강원 강릉시'), '32030');
    assert.equal(match('서울 중구'), '11020');
  });
  it('leaves ambiguous or unknown places unresolved', () => {
    for (const hint of ['고양시', '중구', '강릉', '어딘가', '', '  '])
      assert.equal(match(hint), null, hint);
  });
});
