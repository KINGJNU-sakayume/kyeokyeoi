import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  APP_URL, CLIENT_ID, LIFEHUB_ORIGIN, RESOURCE, beginConnect, completeConnect, connectAvailable, isAuthCallback,
  isConnected, memoryPrefill, outcomes, parseProposal, receipts, rejectLocally, rememberVisitReceipt, sourceFor, sync,
  LifeHubError,
} from '../src/integration/lifehub';
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
