import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOARD_APP, GRID, boardBody, buildBoardTiles, clip } from '../src/integration/boardTiles';
import { PROVINCES } from '../src/map/geodata';
// @ts-expect-error copied plain JS from the board repo (see the header of the file)
import { validateManifest } from './fixtures/board-schema.js';

/** Same values as board js/config.js (CONFIG.imageOrigins / linkOrigins). */
const policy = {
  imageOrigins: [
    'https://kingjnu-sakayume.github.io', 'https://image.aladin.co.kr', 'https://upload.wikimedia.org', 'https://i.scdn.co',
    'https://is1-ssl.mzstatic.com', 'https://is2-ssl.mzstatic.com', 'https://is3-ssl.mzstatic.com', 'https://is4-ssl.mzstatic.com',
    'https://is5-ssl.mzstatic.com', 'https://image.tmdb.org', 'https://t1.daumcdn.net', 'https://search1.kakaocdn.net',
  ],
  linkOrigins: ['https://kingjnu-sakayume.github.io'],
};
const NOW = Date.parse('2026-11-08T03:00:00Z');
const visit = (regionCode: string, visitedOn: string | null, recordedAt = Date.parse('2026-11-01T00:00:00Z')) => ({ regionCode, visitedOn, recordedAt });

function check(manifest: unknown, expectedTiles: number) {
  const r = validateManifest(manifest, policy);
  assert.deepEqual(r.errors, []);
  assert.equal(r.errors.length, 0);
  assert.equal(r.tiles.length, expectedTiles);
  return r;
}

describe('board tiles', () => {
  it('the sample output passes the board schema v1', () => {
    const sample = JSON.parse(readFileSync('board/sample.json', 'utf8'));
    check(sample, 1);
    assert.equal(sample.app, BOARD_APP);
  });

  it('builder output passes the schema, with and without visits', () => {
    for (const visits of [[], [visit('11010', '2026-11-05')], [visit('39020', null), visit('31010', '2026-10-01')]]) {
      const m = buildBoardTiles({ visits }, NOW);
      const r = check(m, 1);
      assert.equal(r.tiles[0].id, 'regions');
    }
  });

  it('fixes id, sizes, size and default', () => {
    const t = buildBoardTiles({ visits: [] }, NOW).tiles[0];
    assert.equal(t.id, 'regions');
    assert.deepEqual(t.sizes, ['2x2', '2x1']);
    assert.equal(t.size, '2x2');
    assert.equal(t.default, true);
    assert.ok(t.name.length <= 30);
    assert.ok(t.href.startsWith('https://kingjnu-sakayume.github.io/kyeokyeoi/'));
  });

  it('empty state: every 시도 off, summary says none visited', () => {
    const t = buildBoardTiles({ visits: [] }, NOW).tiles[0];
    assert.ok(t.data.cells.every((c) => c.state === 'none' || c.state === 'off'));
    assert.match(t.data.summary, /아직 방문한 곳이 없어요/);
  });

  it('marks visited 시도 on and the latest one last, using dates not relative words', () => {
    const t = buildBoardTiles({ visits: [visit('11010', '2026-11-05'), visit('11020', '2026-09-01'), visit('39020', '2026-10-20')] }, NOW).tiles[0];
    const byName = new Map(t.data.cells.map((c) => [c.name, c.state]));
    assert.equal(byName.get('서울'), 'last');
    assert.equal(byName.get('제주'), 'on');
    assert.equal(byName.get('부산'), 'off');
    assert.match(t.data.summary, /2곳 방문 · 마지막 11\/5 서울/);
    assert.doesNotMatch(t.data.summary, /오늘|어제|일 전/);
  });

  it('a visit without a date counts on the day it was recorded', () => {
    const t = buildBoardTiles({ visits: [visit('21010', null, Date.parse('2026-11-06T20:00:00Z')), visit('11010', '2026-11-06')] }, NOW).tiles[0];
    // 20:00Z is 11/7 in Korea, so 부산 is the later one
    assert.equal(t.data.cells.find((c) => c.name === '부산')?.state, 'last');
    assert.match(t.data.summary, /마지막 11\/7 부산/);
  });

  it('ignores region codes it does not know', () => {
    const t = buildBoardTiles({ visits: [visit('99999', '2026-11-05')] }, NOW).tiles[0];
    assert.ok(t.data.cells.every((c) => c.state !== 'on' && c.state !== 'last'));
  });

  it('has a cell for all 17 시도, names within 6 characters, and a valid grid size', () => {
    assert.equal(PROVINCES.length, 17);
    const codes = GRID.filter((c): c is string => c !== null).sort();
    assert.deepEqual(codes, PROVINCES.map((p) => p.code).sort());
    const regions = JSON.parse(readFileSync('public/regions.json', 'utf8')) as { regions: { prov: string }[] };
    for (const prov of new Set(regions.regions.map((r) => r.prov))) assert.ok(codes.includes(prov), `no cell for prov ${prov}`);
    const t = buildBoardTiles({ visits: [] }, NOW).tiles[0];
    for (const c of t.data.cells) if (c.name !== undefined) assert.ok(c.name.length >= 1 && c.name.length <= 6);
    assert.ok(t.data.cells.length <= 200);
    assert.ok(Buffer.byteLength(JSON.stringify(buildBoardTiles({ visits: [] }, NOW))) < 64 * 1024);
  });

  it('clip cuts to the length and drops empty or blank text', () => {
    assert.equal(clip('가나다라마바사', 6), '가나다라마바');
    assert.equal(clip('', 6), undefined);
    assert.equal(clip('   ', 6), undefined);
    assert.equal(clip(undefined, 6), undefined);
  });

  it('is deterministic: the same input gives the same output, and the body ignores generated_at', () => {
    const visits = [visit('11010', '2026-11-05'), visit('31010', '2026-10-01')];
    assert.deepEqual(buildBoardTiles({ visits }, NOW), buildBoardTiles({ visits: [...visits] }, NOW));
    assert.equal(boardBody(buildBoardTiles({ visits }, NOW)), boardBody(buildBoardTiles({ visits }, NOW + 60_000)));
    assert.notEqual(boardBody(buildBoardTiles({ visits }, NOW)), boardBody(buildBoardTiles({ visits: [visits[0]] }, NOW)));
  });
});
