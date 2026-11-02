/**
 * 켜켜이 ↔ Life Hub connection.
 *
 * - Connect: OAuth 2.1 authorization code + PKCE (S256). The owner signs in on Life Hub; 켜켜이 receives
 *   only a `kyeokyeoi:inbox` token for the `/kyeokyeoi` resource. No secret ships in this app: it is a
 *   public client identified by public/lifehub-client.json.
 * - Proposals are fetched live and validated here again. Nothing is stored until the owner approves:
 *   a memory through the normal "새 추억" sheet, a visit after choosing the region.
 * - Receipts: a saved memory/visit carries `source = { service: 'life-hub', originalId: <key> }`, saved in
 *   the same IndexedDB transaction, and that is what gets reported back. Rejections and receipts are kept
 *   in an outbox until Life Hub answers.
 *
 * Network and storage are injected so the flow is testable without a browser.
 */
import type { Memory, RegionVisit, SourceReference, TimeType, TimeValue } from '../db/model';
import { EMOTIONS } from '../utils/emotions';

export const LIFEHUB_ORIGIN = 'https://life-hub-api.213303.workers.dev';
export const APP_URL = 'https://kingjnu-sakayume.github.io/kyeokyeoi/';
export const CLIENT_ID = APP_URL + 'lifehub-client.json';
export const RESOURCE = LIFEHUB_ORIGIN + '/kyeokyeoi';
export const SCOPE = 'kyeokyeoi:inbox';
export const SOURCE_SERVICE = 'life-hub';
const API = LIFEHUB_ORIGIN + '/kyeokyeoi/v1';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface Deps {
  fetch: typeof fetch;
  storage: KV;
  session: KV;
  now: () => number;
  random: (bytes: number) => Uint8Array;
  sha256: (data: Uint8Array) => Promise<Uint8Array>;
}
export function browserDeps(): Deps {
  return {
    fetch: (input, init) => fetch(input, init),
    storage: localStorage,
    session: sessionStorage,
    now: () => Date.now(),
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
  };
}

export type LifeHubErrorKind = 'not_connected' | 'denied' | 'state' | 'network' | 'server';
export class LifeHubError extends Error {
  kind: LifeHubErrorKind;
  constructor(kind: LifeHubErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/* ---------- candidate contract (mirrors life-hub src/adapters/kyeokyeoi.js) ---------- */

export const EMOTION_LABELS = EMOTIONS.map((e) => e.label);
export interface MemoryProposal {
  title: string;
  memo?: string;
  time_text?: string;
  year?: number;
  month?: number;
  day?: number;
  place_text?: string;
  emotions?: string[];
}
export interface VisitProposal {
  place_text: string;
  visited_on?: string;
  note?: string;
}
export type Proposal =
  | { key: string; source: string; type: 'memory'; payload: MemoryProposal }
  | { key: string; source: string; type: 'visit'; payload: VisitProposal };

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every((k) => keys.includes(k));
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const optText = (v: unknown, max: number) => v === undefined || text(v, max);
const int = (v: unknown, lo: number, hi: number) =>
  v === undefined || (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi);
export const validDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const KEY = /^(claude|chatgpt|manual):[A-Za-z0-9_.:-]{8,128}$/;

/** Validates one item from the hub. Returns null for anything that does not match the contract. */
export function parseProposal(item: unknown): Proposal | null {
  if (!obj(item) || typeof item.key !== 'string' || !KEY.test(item.key) || !obj(item.candidate)) return null;
  const c = item.candidate;
  if (c.schema_version !== 1 || typeof c.source !== 'string' || !obj(c.payload) || `${c.source}:${c.idempotency_key}` !== item.key)
    return null;
  const p = c.payload;
  if (c.candidate_type === 'memory') {
    if (!only(p, ['title', 'memo', 'time_text', 'year', 'month', 'day', 'place_text', 'emotions']) || !text(p.title, 80) ||
      !optText(p.memo, 2000) || !optText(p.time_text, 100) || !optText(p.place_text, 100) ||
      !int(p.year, 1900, 2100) || !int(p.month, 1, 12) || !int(p.day, 1, 31) ||
      (p.month !== undefined && p.year === undefined) || (p.day !== undefined && p.month === undefined) ||
      (p.emotions !== undefined && (!Array.isArray(p.emotions) || p.emotions.length > 5 ||
        p.emotions.some((e) => typeof e !== 'string' || !EMOTION_LABELS.includes(e)))))
      return null;
    if (p.day !== undefined && !validDate(`${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`)) return null;
    return { key: item.key, source: c.source, type: 'memory', payload: p as unknown as MemoryProposal };
  }
  if (c.candidate_type === 'visit') {
    if (!only(p, ['place_text', 'visited_on', 'note']) || !text(p.place_text, 100) || !optText(p.note, 500) ||
      (p.visited_on !== undefined && (typeof p.visited_on !== 'string' || !validDate(p.visited_on))))
      return null;
    return { key: item.key, source: c.source, type: 'visit', payload: p as unknown as VisitProposal };
  }
  return null;
}

export function sourceFor(key: string): SourceReference {
  return { service: SOURCE_SERVICE, originalId: key, revision: 1, certainty: 'confirmed' };
}

/** Fields for the "새 추억" sheet. Structured date parts win; otherwise the user's own time words. */
export function memoryPrefill(proposal: MemoryProposal) {
  let timeType: TimeType | null = null;
  let timeValue: TimeValue | null = null;
  if (proposal.year !== undefined && proposal.month !== undefined && proposal.day !== undefined) {
    timeType = 'date';
    timeValue = { year: proposal.year, month: proposal.month, day: proposal.day };
  } else if (proposal.year !== undefined && proposal.month !== undefined) {
    timeType = 'month';
    timeValue = { year: proposal.year, month: proposal.month };
  } else if (proposal.year !== undefined) {
    timeType = 'year';
    timeValue = { year: proposal.year };
  } else if (proposal.time_text) {
    timeType = 'free';
    timeValue = { freeText: proposal.time_text.trim() };
  }
  const emotions = (proposal.emotions ?? [])
    .map((label) => EMOTIONS.find((e) => e.label === label)?.emoji)
    .filter((e): e is string => !!e);
  return {
    title: proposal.title.trim(),
    memo: proposal.memo?.trim() ?? '',
    timeType,
    timeValue,
    emotions,
    placeQuery: proposal.place_text?.trim() ?? '',
  };
}

/* ---------- OAuth ---------- */

const TOKENS_KEY = 'kyeokyeoi.lifehub.tokens.v1';
const PENDING_AUTH_KEY = 'kyeokyeoi.lifehub.pending-auth.v1';
const OUTCOMES_KEY = 'kyeokyeoi.lifehub.outcomes.v1';
const REJECTIONS_KEY = 'kyeokyeoi.lifehub.rejections.v1';
const VISIT_RECEIPTS_KEY = 'kyeokyeoi.lifehub.visit-receipts.v1';
const AUTH_MAX_AGE_MS = 10 * 60 * 1000;
interface Tokens {
  access_token: string;
  access_expires_at: number;
  refresh_token: string;
}
interface PendingAuth {
  state: string;
  verifier: string;
  created_at: number;
}
export type Outcome = 'confirmed' | 'rejected' | 'conflict' | 'missing';

function readJson<T>(store: KV, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function connectAvailable(loc: { origin: string; pathname: string }): boolean {
  const app = new URL(APP_URL);
  return loc.origin === app.origin && (loc.pathname === app.pathname || loc.pathname === app.pathname + 'index.html');
}
export function isConnected(deps: Pick<Deps, 'storage'>): boolean {
  return typeof readJson<Tokens>(deps.storage, TOKENS_KEY)?.refresh_token === 'string';
}
export function isAuthCallback(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.has('state') && (q.has('code') || q.has('error'));
}

export async function beginConnect(deps: Deps): Promise<string> {
  const verifier = b64url(deps.random(32));
  const state = b64url(deps.random(16));
  const challenge = b64url(await deps.sha256(new TextEncoder().encode(verifier)));
  deps.session.setItem(PENDING_AUTH_KEY, JSON.stringify({ state, verifier, created_at: deps.now() } satisfies PendingAuth));
  const q = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: APP_URL, scope: SCOPE, state,
    code_challenge: challenge, code_challenge_method: 'S256', resource: RESOURCE,
  });
  return LIFEHUB_ORIGIN + '/authorize?' + q.toString();
}

async function tokenRequest(deps: Deps, params: Record<string, string>): Promise<Tokens> {
  let response: Response;
  try {
    response = await deps.fetch(LIFEHUB_ORIGIN + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...params }).toString(),
    });
  } catch {
    throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (body.error === 'invalid_grant') {
      deps.storage.removeItem(TOKENS_KEY);
      throw new LifeHubError('not_connected', 'Life Hub 연결이 만료됐어요. 다시 연결해 주세요.');
    }
    throw new LifeHubError('server', `Life Hub 인증 서버 오류 (${response.status})`);
  }
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || String(body.token_type).toLowerCase() !== 'bearer')
    throw new LifeHubError('server', 'Life Hub 응답 형식이 올바르지 않아요.');
  const tokens: Tokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    access_expires_at: deps.now() + (typeof body.expires_in === 'number' ? body.expires_in : 300) * 1000,
  };
  deps.storage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

export async function completeConnect(search: string, deps: Deps): Promise<void> {
  const q = new URLSearchParams(search);
  const pending = readJson<PendingAuth>(deps.session, PENDING_AUTH_KEY);
  deps.session.removeItem(PENDING_AUTH_KEY);
  if (!pending || q.get('state') !== pending.state || deps.now() - pending.created_at > AUTH_MAX_AGE_MS)
    throw new LifeHubError('state', '연결 요청이 만료됐거나 이 브라우저에서 시작되지 않았어요. 다시 연결해 주세요.');
  if (q.has('iss') && q.get('iss') !== LIFEHUB_ORIGIN) throw new LifeHubError('state', '다른 서버의 응답이라 연결하지 않았어요.');
  if (q.has('error'))
    throw new LifeHubError('denied', q.get('error') === 'access_denied' ? 'Life Hub 연결을 거절했어요.' : 'Life Hub 연결에 실패했어요.');
  const code = q.get('code');
  if (!code) throw new LifeHubError('state', '인증 코드가 없어요.');
  await tokenRequest(deps, {
    grant_type: 'authorization_code', code, redirect_uri: APP_URL, code_verifier: pending.verifier, resource: RESOURCE,
  });
}

async function accessToken(deps: Deps, force = false): Promise<string> {
  const tokens = readJson<Tokens>(deps.storage, TOKENS_KEY);
  if (!tokens?.refresh_token) throw new LifeHubError('not_connected', 'Life Hub에 연결되어 있지 않아요.');
  if (!force && tokens.access_expires_at - 60_000 > deps.now()) return tokens.access_token;
  return (await tokenRequest(deps, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).access_token;
}

async function api(deps: Deps, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
  const send = async (token: string) => {
    try {
      return await deps.fetch(API + path, {
        method,
        headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
    }
  };
  let response = await send(await accessToken(deps));
  if (response.status === 401) response = await send(await accessToken(deps, true));
  if (response.status === 401 || response.status === 403) {
    deps.storage.removeItem(TOKENS_KEY);
    throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
  }
  return response;
}

export function disconnect(deps: Deps): void {
  const tokens = readJson<Tokens>(deps.storage, TOKENS_KEY);
  deps.storage.removeItem(TOKENS_KEY);
  if (tokens?.refresh_token)
    void deps
      .fetch(LIFEHUB_ORIGIN + '/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tokens.refresh_token, token_type_hint: 'refresh_token', client_id: CLIENT_ID }).toString(),
      })
      .catch(() => undefined);
}

/* ---------- local decisions and outbox ---------- */

export function outcomes(deps: Pick<Deps, 'storage'>): Record<string, Outcome> {
  const map = readJson<Record<string, Outcome>>(deps.storage, OUTCOMES_KEY);
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}
function stringList(deps: Pick<Deps, 'storage'>, key: string): string[] {
  const list = readJson<string[]>(deps.storage, key);
  return Array.isArray(list) ? list.filter((k) => typeof k === 'string') : [];
}
/** Remember a local rejection; it is sent on the next sync. */
export function rejectLocally(key: string, deps: Pick<Deps, 'storage'>): void {
  const list = stringList(deps, REJECTIONS_KEY);
  if (!list.includes(key)) deps.storage.setItem(REJECTIONS_KEY, JSON.stringify([...list, key]));
}
/**
 * A visit approval can land on a region that was already marked visited without a Life Hub source, so
 * the visit receipt is also kept here. Memories are always created with their source.
 */
export function rememberVisitReceipt(key: string, visitId: string, deps: Pick<Deps, 'storage'>): void {
  const map = readJson<Record<string, string>>(deps.storage, VISIT_RECEIPTS_KEY) ?? {};
  map[key] = visitId;
  deps.storage.setItem(VISIT_RECEIPTS_KEY, JSON.stringify(map));
}

export interface Receipt {
  key: string;
  entity_type: 'memory' | 'visit';
  entity_id: string;
}
/** Every approval recorded in 켜켜이: from saved records' sources, plus visit receipts kept locally. */
export function receipts(memories: Memory[], visits: RegionVisit[], deps: Pick<Deps, 'storage'>): Receipt[] {
  const out = new Map<string, Receipt>();
  for (const m of memories)
    if (m.source?.service === SOURCE_SERVICE) out.set(m.source.originalId, { key: m.source.originalId, entity_type: 'memory', entity_id: m.id });
  for (const v of visits)
    if (v.source?.service === SOURCE_SERVICE) out.set(v.source.originalId, { key: v.source.originalId, entity_type: 'visit', entity_id: v.id });
  const local = readJson<Record<string, string>>(deps.storage, VISIT_RECEIPTS_KEY) ?? {};
  for (const [key, id] of Object.entries(local))
    if (!out.has(key) && typeof id === 'string') out.set(key, { key, entity_type: 'visit', entity_id: id });
  return [...out.values()];
}

export interface SyncResult {
  proposals: Proposal[];
  receiptsSent: number;
  rejectionsSent: number;
  conflicts: number;
  waiting: number;
}
/** Send decisions first, then fetch what is still pending (minus anything decided here). */
export async function sync(memories: Memory[], visits: RegionVisit[], deps: Deps): Promise<SyncResult> {
  const done = outcomes(deps);
  const result: SyncResult = { proposals: [], receiptsSent: 0, rejectionsSent: 0, conflicts: 0, waiting: 0 };
  const record = (key: string, response: Response, ok: Outcome) => {
    if (response.ok) done[key] = ok;
    else if (response.status === 409) done[key] = 'conflict';
    else if (response.status === 404) done[key] = 'missing';
    else {
      result.waiting++;
      return false;
    }
    deps.storage.setItem(OUTCOMES_KEY, JSON.stringify(done));
    return response.ok;
  };
  const decided = new Set<string>();
  for (const r of receipts(memories, visits, deps)) {
    decided.add(r.key);
    if (done[r.key]) continue;
    if (record(r.key, await api(deps, 'POST', '/receipts', r), 'confirmed')) result.receiptsSent++;
  }
  for (const key of stringList(deps, REJECTIONS_KEY)) {
    decided.add(key);
    if (done[key]) continue;
    if (record(key, await api(deps, 'POST', '/rejections', { key }), 'rejected')) result.rejectionsSent++;
  }
  const response = await api(deps, 'GET', '/candidates?status=pending&limit=100');
  if (!response.ok) throw new LifeHubError('server', `Life Hub 제안을 가져오지 못했어요 (${response.status})`);
  const body = (await response.json().catch(() => null)) as { candidates?: unknown } | null;
  if (!body || !Array.isArray(body.candidates)) throw new LifeHubError('server', 'Life Hub 응답 형식이 올바르지 않아요.');
  for (const item of body.candidates) {
    const p = parseProposal(item);
    if (p && !decided.has(p.key)) result.proposals.push(p);
  }
  result.conflicts = Object.values(done).filter((v) => v === 'conflict').length;
  return result;
}
