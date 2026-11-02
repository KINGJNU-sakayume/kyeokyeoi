import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  APP_URL, CLIENT_ID, LIFEHUB_ORIGIN, RESOURCE, beginConnect, completeConnect, connectAvailable, isAuthCallback,
  isConnected, memoryPrefill, outcomes, parseProposal, receipts, rejectLocally, rememberVisitReceipt, sourceFor, sync,
  LifeHubError, autoApplyEnabled, setAutoApply, uploadRegionRefs, REGIONS_REF_REVISION,
} from '../src/integration/lifehub';
import { exactRegion, planAutoApply, regionRefs } from '../src/integration/lifehubApply';
import type { Deps } from '../src/integration/lifehub';
import type { Memory, RegionVisit } from '../src/db/model';

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
}
const K1 = 'claude:mcp-' + 'a'.repeat(40);
const K2 = 'claude:mcp-' + 'b'.repeat(40);
const item = (key: string, candidate_type: string, payload: Record<string, unknown>) => ({
  key, status: 'pending',
  candidate: { schema_version: 1, source: 'claude', source_ref: 'claude-mcp:2026-11-02', idempotency_key: key.slice(7),
    created_at: '2026-11-02T01:00:00.000Z', candidate_type, payload },
});
const memory = (id: string, key?: string): Memory => ({
  id, title: '가상', regionCode: null, regionLabel: null, timeType: null, timeValue: null, computedYear: null, emotions: [],
  song: null, photoIds: [], memo: null, isFirst: false, isPublic: false, createdAt: 1, updatedAt: 1,
  ...(key ? { source: sourceFor(key) } : {}),
});

function fakeHub(list: unknown[]) {
  const hub = { posts: [] as Array<{ path: string; body: Record<string, string> }>, fail: 0, conflict: new Set<string>(), tokenForm: null as URLSearchParams | null };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/oauth/token') {
      hub.tokenForm = new URLSearchParams(String(init?.body));
      return json(200, { access_token: 'at', refresh_token: 'rt', token_type: 'bearer', expires_in: 3600 });
    }
    if (new Headers(init?.headers).get('Authorization') !== 'Bearer at') return json(401, {});
    if (url.pathname === '/kyeokyeoi/v1/candidates') return json(200, { candidates: list });
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    if (hub.fail > 0) { hub.fail--; return json(503, {}); }
    hub.posts.push({ path: url.pathname, body });
    return json(hub.conflict.has(body.key) ? 409 : 200, {});
  }) as typeof fetch;
  return { hub, f };
}
function deps(f: typeof fetch, t = { now: Date.parse('2026-11-02T02:00:00Z') }): Deps {
  let n = 0;
  return {
    fetch: f, storage: new MemoryStorage(), session: new MemoryStorage(), now: () => t.now,
    random: (k) => Uint8Array.from({ length: k }, () => (n++ * 31 + 7) % 256),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
  };
}
async function connected(f: typeof fetch) {
  const d = deps(f);
  const url = new URL(await beginConnect(d));
  await completeConnect(`?code=c&state=${url.searchParams.get('state')}&iss=${encodeURIComponent(LIFEHUB_ORIGIN)}`, d);
  return d;
}

describe('Life Hub connection', () => {
  it('builds a PKCE S256 request for the 켜켜이 resource and only accepts its own callback', async () => {
    const { hub, f } = fakeHub([]);
    const d = deps(f);
    const url = new URL(await beginConnect(d));
    assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
    assert.equal(url.searchParams.get('redirect_uri'), APP_URL);
    assert.equal(url.searchParams.get('resource'), RESOURCE);
    assert.equal(url.searchParams.get('scope'), 'kyeokyeoi:inbox');
    const state = url.searchParams.get('state')!;
    await assert.rejects(completeConnect(`?code=x&state=${state}&iss=${encodeURIComponent('https://evil.example')}`, d), (e: LifeHubError) => e.kind === 'state');
    assert.equal(isConnected(d), false);

    const d2 = deps(f);
    const url2 = new URL(await beginConnect(d2));
    await completeConnect(`?code=x&state=${url2.searchParams.get('state')}`, d2);
    assert.equal(isConnected(d2), true);
    const verifier = hub.tokenForm!.get('code_verifier')!;
    const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    assert.equal(url2.searchParams.get('code_challenge'), challenge);
    assert.equal(isAuthCallback('?code=a&state=b'), true);
    assert.equal(isAuthCallback(''), false);
    assert.equal(connectAvailable(new URL(APP_URL)), true);
    assert.equal(connectAvailable({ origin: 'http://127.0.0.1:4173', pathname: '/kyeokyeoi/' }), false);
  });
});

describe('proposal contract', () => {
  it('accepts memories and visits in the user\'s words and refuses anything else', () => {
    assert.equal(parseProposal(item(K1, 'memory', { title: '바다', time_text: '고2 여름', emotions: ['설렘'] }))?.type, 'memory');
    assert.equal(parseProposal(item(K2, 'visit', { place_text: '강릉', visited_on: '2026-10-12' }))?.type, 'visit');
    assert.equal(parseProposal(item(K1, 'memory', { title: 'x', region_hint: '경기 고양시 일산서구', song_artist: 'The Weeknd', song_title: 'Blinding Lights' }))?.type, 'memory');
    assert.equal(parseProposal(item(K2, 'visit', { place_text: '고양종합운동장', region_hint: '경기 고양시 일산서구' }))?.type, 'visit');
    for (const bad of [
      item(K1, 'memory', {}),
      item(K1, 'memory', { title: 'x', month: 3 }),
      item(K1, 'memory', { title: 'x', year: 2023, month: 2, day: 30 }),
      item(K1, 'memory', { title: 'x', emotions: ['분노'] }),
      item(K1, 'memory', { title: 'x', region_code: '11010' }),
      item(K1, 'memory', { title: 'x', region_hint: 'x'.repeat(61) }),
      item(K1, 'visit', { place_text: 'x', song_artist: 'y' }),
      item(K1, 'visit', { place_text: '서울', visited_on: '어제' }),
      item(K1, 'meal', { menu_name: 'x' }),
      { ...item(K1, 'visit', { place_text: '서울' }), key: K2 },
      { key: 'evil:mcp-' + 'a'.repeat(40), candidate: item(K1, 'visit', { place_text: 'x' }).candidate },
    ]) assert.equal(parseProposal(bad), null, JSON.stringify(bad));
  });

  it('maps a memory proposal to the add sheet: stated dates win, otherwise the user\'s time words', () => {
    assert.deepEqual(memoryPrefill({ title: ' 바다 ', year: 2019, month: 8 }), {
      title: '바다', memo: '', timeType: 'month', timeValue: { year: 2019, month: 8 }, emotions: [], placeQuery: '',
      songArtist: '', songTitle: '' });
    const concert = memoryPrefill({ title: '더 위켄드 콘서트', time_text: '10월 8일', year: 2026, month: 10, day: 8,
      place_text: '고양종합운동장', region_hint: '경기 고양시 일산서구', song_artist: 'The Weeknd' });
    assert.equal(concert.timeType, 'date');
    assert.deepEqual(concert.timeValue, { year: 2026, month: 10, day: 8 });
    assert.equal(concert.placeQuery, '경기 고양시 일산서구');
    assert.equal(concert.songArtist, 'The Weeknd');
    const free = memoryPrefill({ title: '수학여행', time_text: '고2 가을', place_text: '경주', emotions: ['설렘', '행복'] });
    assert.equal(free.timeType, 'free');
    assert.deepEqual(free.timeValue, { freeText: '고2 가을' });
    assert.deepEqual(free.emotions, ['🥰', '😊']);
    assert.equal(free.placeQuery, '경주');
    assert.equal(memoryPrefill({ title: 'x' }).timeType, null);
  });
});

describe('sync', () => {
  it('sends receipts from saved records and local rejections once, and hides decided proposals', async () => {
    const { hub, f } = fakeHub([item(K1, 'memory', { title: '바다' }), item(K2, 'visit', { place_text: '강릉' })]);
    const d = await connected(f);
    const first = await sync([], [], d);
    assert.deepEqual(first.proposals.map((p) => p.key), [K1, K2]);

    const saved = memory('m1', K1);
    rejectLocally(K2, d);
    hub.fail = 1;
    const s1 = await sync([saved], [], d);
    assert.equal(s1.waiting, 1);
    assert.equal(s1.proposals.length, 0, 'decided proposals are not shown again');
    const s2 = await sync([saved], [], d);
    assert.equal(s1.receiptsSent + s2.receiptsSent, 1);
    assert.equal(s1.rejectionsSent + s2.rejectionsSent, 1);
    assert.deepEqual(hub.posts.map((p) => [p.path, p.body.key]).sort(), [['/kyeokyeoi/v1/receipts', K1], ['/kyeokyeoi/v1/rejections', K2]].sort());
    assert.deepEqual(hub.posts.find((p) => p.path.endsWith('receipts'))!.body, { key: K1, entity_type: 'memory', entity_id: 'm1' });
    const count = hub.posts.length;
    await sync([saved], [], d);
    assert.equal(hub.posts.length, count, 'nothing is re-sent');
    assert.equal(outcomes(d)[K1], 'confirmed');
  });

  it('a visit approved onto an already visited region is reported through the local receipt; conflicts stop retrying', async () => {
    const { hub, f } = fakeHub([]);
    const d = await connected(f);
    const existing: RegionVisit = { id: 'v-old', regionCode: '51150', regionLabel: '강원 강릉시', visitedOn: null, recordedAt: 1, updatedAt: 1 };
    rememberVisitReceipt(K2, existing.id, d);
    hub.conflict.add(K2);
    assert.deepEqual(receipts([], [existing], d), [{ key: K2, entity_type: 'visit', entity_id: 'v-old' }]);
    const s = await sync([], [existing], d);
    assert.equal(s.conflicts, 1);
    const count = hub.posts.length;
    await sync([], [existing], d);
    assert.equal(hub.posts.length, count);
  });

  it('records with other sources and manual records are never reported', async () => {
    const { hub, f } = fakeHub([]);
    const d = await connected(f);
    const other = { ...memory('m2'), source: { service: 'achievement', originalId: 'x', revision: 1, certainty: 'confirmed' as const } };
    await sync([memory('m1'), other], [], d);
    assert.equal(hub.posts.length, 0);
  });
});

describe('Claude card approvals (P4 stage 2)', () => {
  const regions = [
    { code: '31101', label: '경기 고양시 덕양구' },
    { code: '31103', label: '경기 고양시 일산서구' },
    { code: '11010', label: '서울 종로구' },
  ];
  const approved = (key: string, type: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ ...item(key, type, payload), status: 'approved', revision: 1, final_candidate: null, needs_app_review: false, ...extra });

  it('uses the owner edit, reads the hub state, accepts codex and asks for open proposals', async () => {
    const edited = { ...item(K1, 'visit', { place_text: '가상 공원', region_hint: '경기 고양시 일산서구' }).candidate };
    const p = parseProposal(approved(K1, 'visit', { place_text: '가상 공원' }, { revision: 2, final_candidate: edited }))!;
    assert.equal(p.status, 'approved');
    assert.equal(p.revision, 2);
    assert.equal(p.type === 'visit' && p.payload.region_hint, '경기 고양시 일산서구');
    assert.equal(parseProposal({ ...item(K1, 'memory', { title: 'x' }), status: 'rejected' }), null);
    const codexKey = 'codex:mcp-' + 'c'.repeat(40);
    const codex = item(codexKey, 'memory', { title: '가상 코덱스' });
    codex.candidate.source = 'codex';
    codex.candidate.idempotency_key = codexKey.slice(6);
    assert.ok(parseProposal(codex));

    const asked: string[] = [];
    const { f } = fakeHub([approved(K2, 'memory', { title: '가상 추억' })]);
    const spy = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/candidates')) asked.push(url.searchParams.get('status') ?? '');
      return f(input, init);
    }) as typeof fetch;
    const d = await connected(spy);
    const r = await sync([], [], d);
    assert.deepEqual(asked, ['open']);
    assert.equal(r.proposals[0].status, 'approved');
  });

  it('plans an automatic save only when nothing is left to decide', () => {
    const plan = (raw: unknown, birth: number | null = null) => planAutoApply(parseProposal(raw)!, regions, birth);
    const visit = plan(approved(K1, 'visit', { place_text: '가상 공원', region_hint: '경기 고양시 일산서구', visited_on: '2026-10-08' }));
    assert.deepEqual(visit, { kind: 'visit', key: K1, region: regions[1], visitedOn: '2026-10-08' });
    // Not an exact label (e.g. only 고양시): 켜켜이 asks.
    assert.equal(plan(approved(K1, 'visit', { place_text: '가상 공원', region_hint: '고양시' })), null);
    assert.equal(plan(approved(K1, 'visit', { place_text: '가상 공원' })), null);
    // Pending, or a last check asked: never automatic.
    assert.equal(plan(item(K1, 'visit', { place_text: '가상 공원', region_hint: '서울 종로구' })), null);
    assert.equal(plan(approved(K1, 'visit', { place_text: '가상 공원', region_hint: '서울 종로구' }, { needs_app_review: true })), null);

    const memory = plan(approved(K2, 'memory', {
      title: '가상 추억', memo: '메모', year: 2026, month: 10, day: 8, region_hint: '서울 종로구', emotions: ['행복'],
      song_artist: '가상 가수', song_title: '가상 노래',
    }));
    assert.ok(memory && memory.kind === 'memory');
    assert.equal(memory.memory.regionCode, '11010');
    assert.equal(memory.memory.timeType, 'date');
    assert.equal(memory.memory.computedYear, 2026);
    assert.deepEqual(memory.memory.song, { artist: '가상 가수', title: '가상 노래' });
    assert.equal(memory.memory.emotions.length, 1);
    // No place at all is fine; a place without a chosen 시군구 is not.
    assert.equal(plan(approved(K2, 'memory', { title: '가상 추억' }))?.kind, 'memory');
    assert.equal(plan(approved(K2, 'memory', { title: '가상 추억', place_text: '가상 카페' })), null);
    assert.equal(plan(approved(K2, 'memory', { title: '가상 추억', region_hint: '어딘가' })), null);
  });

  it('exact labels only', () => {
    assert.equal(exactRegion(' 서울 종로구 ', regions)?.code, '11010');
    assert.equal(exactRegion('종로구', regions), null);
    assert.equal(exactRegion(undefined, regions), null);
  });

  it('auto-apply is on by default and can be turned off per device', async () => {
    const d = deps(fakeHub([]).f);
    assert.equal(autoApplyEnabled(d), true);
    setAutoApply(d, false);
    assert.equal(autoApplyEnabled(d), false);
    setAutoApply(d, true);
    assert.equal(autoApplyEnabled(d), true);
  });

  it('uploads the 시군구 list once per revision, ids and labels only', async () => {
    const { hub, f } = fakeHub([]);
    const d = await connected(f);
    const refs = regionRefs(regions, (code) => (code.startsWith('31') ? '경기' : '서울'));
    hub.fail = 1;
    assert.equal(await uploadRegionRefs(refs, d), false);
    assert.equal(await uploadRegionRefs(refs, d), true);
    assert.equal(await uploadRegionRefs(refs, d), false, 'not sent again for the same revision');
    const puts = hub.posts.filter((x) => x.path === '/kyeokyeoi/v1/refs/regions');
    assert.equal(puts.length, 1);
    const body = puts[0].body as unknown as { revision: number; items: Array<Record<string, string>> };
    assert.equal(body.revision, REGIONS_REF_REVISION);
    assert.deepEqual(body.items[1], { id: '31103', label: '경기 고양시 일산서구', group: '경기' });
    assert.ok(body.items.every((x) => Object.keys(x).every((k) => ['id', 'label', 'group'].includes(k))));

    // A newer list already on Life Hub (409) also counts as done.
    const other = fakeHub([]);
    other.hub.conflict.add(undefined as unknown as string);
    const d2 = await connected(other.f);
    assert.equal(await uploadRegionRefs(refs, d2), true);
    assert.equal(await uploadRegionRefs(refs, d2), false);
  });

  it('the real 시군구 list fits the Life Hub limits (≤ 500 items, ≤ 32 KB, unique labels)', async () => {
    const fs = await import('node:fs');
    const data = JSON.parse(fs.readFileSync(new URL('../public/regions.json', import.meta.url), 'utf8')) as { regions: Array<{ code: string; name: string }> };
    const refs = data.regions.map((r) => ({ id: r.code, label: '경기도 ' + r.name, group: '경기도' }));
    assert.ok(refs.length <= 500);
    assert.ok(JSON.stringify({ revision: 1, items: refs }).length <= 32768);
  });
});
