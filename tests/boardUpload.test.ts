import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { BOARD_URL, MIN_INTERVAL_MS, REFRESH_MS, boardNeedsScope, boardPending, setBoardEnabled, uploadBoard } from '../src/integration/boardUpload';
import { LIFEHUB_ORIGIN, beginConnect, completeConnect, isConnected, disconnect } from '../src/integration/lifehub';
import type { Deps } from '../src/integration/lifehub';
import type { Memory, RegionVisit } from '../src/db/model';

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
}
const T0 = Date.parse('2026-11-08T03:00:00Z');
const visit = (code: string, on: string | null): RegionVisit => ({ id: 'v' + code, regionCode: code, regionLabel: code, visitedOn: on, recordedAt: T0 - 1e9, updatedAt: T0 - 1e9 });
const VISITS = [visit('11010', '2026-11-05')];
const MEMORY = { id: 'm1', title: '가상' } as Memory;

interface Reply { status: number; body?: unknown; headers?: Record<string, string> }
function fakeHub(replies: Reply[] = []) {
  const hub = { puts: [] as { body: { generated_at: string; tiles: unknown[] }; auth: string | null }[], tokens: 0, replies, fallback: { status: 200, body: {} } as Reply };
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/oauth/token') {
      hub.tokens++;
      return new Response(JSON.stringify({ access_token: 'at' + hub.tokens, refresh_token: 'rt', token_type: 'bearer', expires_in: 3600 }), { status: 200 });
    }
    assert.equal(String(input), BOARD_URL);
    assert.equal(init?.method, 'PUT');
    hub.puts.push({ body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get('Authorization') });
    const r = hub.replies.shift() ?? hub.fallback;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { hub, f };
}
function setup(f: typeof fetch, opts: { enabled?: boolean } = {}) {
  const t = { now: T0 };
  let n = 0;
  const d: Deps = {
    fetch: f, storage: new MemoryStorage(), session: new MemoryStorage(), now: () => t.now,
    random: (k) => Uint8Array.from({ length: k }, () => (n++ * 31 + 7) % 256),
    sha256: async (b) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(b))),
  };
  return { d, t, ready: async () => {
    const url = new URL(await beginConnect(d));
    await completeConnect(`?code=c&state=${url.searchParams.get('state')}&iss=${encodeURIComponent(LIFEHUB_ORIGIN)}`, d);
    if (opts.enabled !== false) setBoardEnabled(d, true);
    return d;
  } };
}
const input = (visits = VISITS, memories: Memory[] = []) => ({ visits, memories });

describe('board upload', () => {
  it('sends the list with the Life Hub token and records success', async () => {
    const { hub, f } = fakeHub();
    const s = setup(f);
    await s.ready();
    const r = await uploadBoard(input(), s.d);
    assert.deepEqual(r, { status: 'sent', unchanged: false, ignored: false });
    assert.equal(hub.puts.length, 1);
    assert.match(hub.puts[0].auth ?? '', /^Bearer at/);
    assert.equal(hub.puts[0].body.generated_at, new Date(T0).toISOString());
    assert.equal(boardPending(s.d), false);
  });

  it('treats unchanged and ignored replies as success', async () => {
    const { f } = fakeHub([{ status: 200, body: { unchanged: true } }, { status: 200, body: { ignored: true } }]);
    const s = setup(f);
    await s.ready();
    assert.deepEqual(await uploadBoard(input(), s.d), { status: 'sent', unchanged: true, ignored: false });
    s.t.now += REFRESH_MS;
    assert.deepEqual(await uploadBoard(input(), s.d), { status: 'sent', unchanged: false, ignored: true });
  });

  it('insufficient_scope keeps the tokens, flags a reconnect and stops retrying until reconnected', async () => {
    const { hub, f } = fakeHub([{ status: 403, headers: { 'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="kyeokyeoi:board"' } }]);
    const s = setup(f);
    await s.ready();
    assert.deepEqual(await uploadBoard(input(), s.d), { status: 'needs_scope' });
    assert.equal(isConnected(s.d), true);
    assert.equal(boardNeedsScope(s.d), true);
    s.t.now += 2 * MIN_INTERVAL_MS;
    assert.deepEqual(await uploadBoard(input(), s.d), { status: 'skipped', reason: 'needs_scope' });
    assert.equal(hub.puts.length, 1);
    // signing in again (with the new scope) clears the flag
    const url = new URL(await beginConnect(s.d));
    assert.match(url.searchParams.get('scope') ?? '', /kyeokyeoi:board/);
    await completeConnect(`?code=c&state=${url.searchParams.get('state')}&iss=${encodeURIComponent(LIFEHUB_ORIGIN)}`, s.d);
    assert.equal(boardNeedsScope(s.d), false);
    assert.equal((await uploadBoard(input(), s.d)).status, 'sent');
  });

  it('any other 403 drops the connection like the existing rule', async () => {
    const { f } = fakeHub([{ status: 403 }]);
    const s = setup(f);
    await s.ready();
    await assert.rejects(uploadBoard(input(), s.d), (e: Error & { kind?: string }) => e.kind === 'not_connected');
    assert.equal(isConnected(s.d), false);
  });

  it('a 401 after a token refresh drops the connection; a single 401 is retried with a fresh token', async () => {
    const a = fakeHub([{ status: 401 }, { status: 200 }]);
    const sa = setup(a.f);
    await sa.ready();
    assert.equal((await uploadBoard(input(), sa.d)).status, 'sent');
    assert.equal(a.hub.puts.length, 2);
    const b = fakeHub([{ status: 401 }, { status: 401 }]);
    const sb = setup(b.f);
    await sb.ready();
    await assert.rejects(uploadBoard(input(), sb.d), (e: Error & { kind?: string }) => e.kind === 'not_connected');
    assert.equal(isConnected(sb.d), false);
  });

  it('400 and 413 are not retried with the same content, but a changed list is sent', async () => {
    for (const status of [400, 413]) {
      const { hub, f } = fakeHub([{ status }]);
      const s = setup(f);
      await s.ready();
      assert.deepEqual(await uploadBoard(input(), s.d), { status: 'rejected', httpStatus: status });
      s.t.now += 2 * MIN_INTERVAL_MS;
      assert.deepEqual(await uploadBoard(input(), s.d), { status: 'skipped', reason: 'rejected' });
      assert.equal(hub.puts.length, 1);
      assert.equal(isConnected(s.d), true);
      assert.equal((await uploadBoard(input([visit('11010', '2026-11-05'), visit('21010', '2026-11-06')]), s.d)).status, 'sent');
    }
  });

  it('5xx and network errors keep it pending and try again later', async () => {
    const { hub, f } = fakeHub([{ status: 503 }]);
    const s = setup(f);
    await s.ready();
    assert.deepEqual(await uploadBoard(input(), s.d), { status: 'retry' });
    assert.equal(boardPending(s.d), true);
    s.t.now += MIN_INTERVAL_MS;
    assert.equal((await uploadBoard(input(), s.d)).status, 'sent');
    assert.equal(hub.puts.length, 2);

    let down = true;
    const net = (async (i: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(i)).pathname !== '/oauth/token' && down) throw new TypeError('offline');
      return f(i, init);
    }) as typeof fetch;
    const s2 = setup(net);
    await s2.ready();
    assert.deepEqual(await uploadBoard(input(), s2.d), { status: 'retry' });
    assert.equal(boardPending(s2.d), true);
    down = false;
    s2.t.now += MIN_INTERVAL_MS;
    assert.equal((await uploadBoard(input(), s2.d)).status, 'sent');
  });

  it('sends at most once every 10 minutes and the pending list goes out when the time is up', async () => {
    const { hub, f } = fakeHub();
    const s = setup(f);
    await s.ready();
    await uploadBoard(input(), s.d);
    const changed = input([...VISITS, visit('21010', '2026-11-06')]);
    s.t.now += 3 * 60 * 1000;
    const r = await uploadBoard(changed, s.d);
    assert.deepEqual(r, { status: 'wait', waitMs: 7 * 60 * 1000 });
    assert.equal(boardPending(s.d), true);
    assert.equal(hub.puts.length, 1);
    s.t.now += 7 * 60 * 1000; // next run (timer or the next time the app opens)
    assert.equal((await uploadBoard(changed, s.d)).status, 'sent');
    assert.equal(hub.puts.length, 2);
    assert.equal(boardPending(s.d), false);
  });

  it('does not send an unchanged list, but does once a day even if unchanged', async () => {
    const { hub, f } = fakeHub();
    const s = setup(f);
    await s.ready();
    await uploadBoard(input(), s.d);
    s.t.now += 60 * 60 * 1000;
    assert.deepEqual(await uploadBoard(input(), s.d), { status: 'skipped', reason: 'same' });
    assert.equal(hub.puts.length, 1);
    s.t.now += REFRESH_MS;
    assert.equal((await uploadBoard(input(), s.d)).status, 'sent');
    assert.equal(hub.puts.length, 2);
    assert.equal(hub.puts[1].body.generated_at, new Date(s.t.now).toISOString());
  });

  it('a pending list is sent on the next run in a new session (storage survives)', async () => {
    const { hub, f } = fakeHub();
    const s = setup(f);
    await s.ready();
    await uploadBoard(input(), s.d);
    const changed = input([...VISITS, visit('21010', '2026-11-06')]);
    s.t.now += 60 * 1000;
    await uploadBoard(changed, s.d); // waits: app closes here
    s.t.now += 20 * 60 * 1000; // opened again later
    assert.equal(boardPending(s.d), true);
    assert.equal((await uploadBoard(changed, s.d)).status, 'sent');
    assert.equal(hub.puts.length, 2);
  });

  it('does not send when not connected, switched off, or the archive is empty', async () => {
    const { hub, f } = fakeHub();
    const off = setup(f, { enabled: false });
    await off.ready();
    assert.deepEqual(await uploadBoard(input(), off.d), { status: 'skipped', reason: 'off' });
    const empty = setup(f);
    await empty.ready();
    assert.deepEqual(await uploadBoard(input([], []), empty.d), { status: 'skipped', reason: 'empty' });
    assert.equal((await uploadBoard(input([], [MEMORY]), empty.d)).status, 'sent'); // memories alone count as records
    const none = setup(f);
    setBoardEnabled(none.d, true);
    assert.deepEqual(await uploadBoard(input(), none.d), { status: 'skipped', reason: 'not_connected' });
    const gone = setup(f);
    await gone.ready();
    disconnect(gone.d);
    assert.deepEqual(await uploadBoard(input(), gone.d), { status: 'skipped', reason: 'not_connected' });
    assert.equal(hub.puts.length, 1);
  });

  it('is off by default on a device', async () => {
    const { f } = fakeHub();
    const s = setup(f, { enabled: false });
    await s.ready();
    assert.equal((await uploadBoard(input(), s.d)).status, 'skipped');
  });
});
