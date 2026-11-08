/**
 * Uploads the board tile list to Life Hub (`PUT /kyeokyeoi/v1/board`, scope `kyeokyeoi:board`).
 *
 * This has its own request function on purpose: lifehub.ts `api()` drops the Life Hub tokens on a 401/403,
 * which for a missing `kyeokyeoi:board` scope would also cut the inbox and sync. Here an
 * `insufficient_scope` 403 keeps the tokens and only asks for a reconnect.
 *
 * Rules: at most one request per 10 minutes; nothing is sent when the list is unchanged (sha256 without
 * `generated_at`) except once a day, so the board does not mark the app as stale; only when this device is
 * switched on for it, and never with an empty archive (a new device must not overwrite the list).
 */
import type { Memory, RegionVisit } from '../db/model';
import { boardBody, buildBoardTiles } from './boardTiles';
import {
  BOARD_NEEDS_SCOPE_KEY, LIFEHUB_ORIGIN, LifeHubError, accessToken, clearTokens, isConnected, type Deps,
} from './lifehub';

export const BOARD_URL = LIFEHUB_ORIGIN + '/kyeokyeoi/v1/board';
export const MIN_INTERVAL_MS = 10 * 60 * 1000;
export const REFRESH_MS = 24 * 60 * 60 * 1000;

const ENABLED_KEY = 'kyeokyeoi.lifehub.board-enabled.v1';
const SHA_KEY = 'kyeokyeoi.lifehub.board-sha.v1';
const OK_AT_KEY = 'kyeokyeoi.lifehub.board-ok-at.v1';
const ATTEMPT_AT_KEY = 'kyeokyeoi.lifehub.board-attempt-at.v1';
const PENDING_KEY = 'kyeokyeoi.lifehub.board-pending.v1';
const REJECTED_KEY = 'kyeokyeoi.lifehub.board-rejected.v1';

type Store = Pick<Deps, 'storage'>;

/** 「이 기기에서 보드에 올리기」: off until the owner turns it on, per device. */
export function boardEnabled(deps: Store): boolean {
  return deps.storage.getItem(ENABLED_KEY) === 'on';
}
export function setBoardEnabled(deps: Store, on: boolean): void {
  if (on) deps.storage.setItem(ENABLED_KEY, 'on');
  else deps.storage.removeItem(ENABLED_KEY);
}
export function boardNeedsScope(deps: Store): boolean {
  return deps.storage.getItem(BOARD_NEEDS_SCOPE_KEY) === '1';
}
export function boardPending(deps: Store): boolean {
  return deps.storage.getItem(PENDING_KEY) === '1';
}
const num = (deps: Store, key: string): number | null => {
  const n = Number(deps.storage.getItem(key));
  return deps.storage.getItem(key) !== null && Number.isFinite(n) ? n : null;
};

export type BoardResult =
  | { status: 'skipped'; reason: 'not_connected' | 'off' | 'needs_scope' | 'empty' | 'same' | 'rejected' }
  | { status: 'wait'; waitMs: number }
  | { status: 'sent'; unchanged: boolean; ignored: boolean }
  | { status: 'retry' }
  | { status: 'rejected'; httpStatus: number }
  | { status: 'needs_scope' };

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

async function put(deps: Deps, body: string): Promise<Response> {
  const send = (token: string) =>
    deps.fetch(BOARD_URL, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body,
    });
  let response = await send(await accessToken(deps));
  if (response.status === 401) response = await send(await accessToken(deps, true));
  return response;
}

/**
 * Sends the tile list when the rules allow. Network and server errors are reported as `retry`; a lost
 * connection (401 after a refresh, or a 403 other than insufficient_scope) throws `not_connected` after
 * dropping the tokens, like the rest of the Life Hub connection.
 */
export async function uploadBoard(
  input: { visits: RegionVisit[]; memories: Memory[] },
  deps: Deps,
): Promise<BoardResult> {
  if (!isConnected(deps)) return { status: 'skipped', reason: 'not_connected' };
  if (!boardEnabled(deps)) return { status: 'skipped', reason: 'off' };
  if (boardNeedsScope(deps)) return { status: 'skipped', reason: 'needs_scope' };
  if (input.visits.length === 0 && input.memories.length === 0) return { status: 'skipped', reason: 'empty' };

  const now = deps.now();
  const manifest = buildBoardTiles({ visits: input.visits }, now);
  const sha = hex(await deps.sha256(new TextEncoder().encode(boardBody(manifest))));
  const lastSha = deps.storage.getItem(SHA_KEY);
  const okAt = num(deps, OK_AT_KEY);
  const stale = okAt === null || now - okAt >= REFRESH_MS || now < okAt;
  if (sha === lastSha && !stale) {
    deps.storage.removeItem(PENDING_KEY);
    return { status: 'skipped', reason: 'same' };
  }
  // The server refused this exact list (400/413): a bug on this side, so do not send it again.
  if (sha === deps.storage.getItem(REJECTED_KEY)) return { status: 'skipped', reason: 'rejected' };

  deps.storage.setItem(PENDING_KEY, '1');
  const attemptAt = num(deps, ATTEMPT_AT_KEY);
  if (attemptAt !== null && now >= attemptAt && now - attemptAt < MIN_INTERVAL_MS)
    return { status: 'wait', waitMs: MIN_INTERVAL_MS - (now - attemptAt) };

  deps.storage.setItem(ATTEMPT_AT_KEY, String(now));
  let response: Response;
  try {
    response = await put(deps, JSON.stringify(manifest));
  } catch (e) {
    if (e instanceof LifeHubError && e.kind === 'not_connected') throw e;
    return { status: 'retry' };
  }
  if (response.status === 200) {
    const reply = (await response.json().catch(() => ({}))) as { unchanged?: unknown; ignored?: unknown };
    deps.storage.setItem(SHA_KEY, sha);
    deps.storage.setItem(OK_AT_KEY, String(now));
    deps.storage.removeItem(PENDING_KEY);
    deps.storage.removeItem(REJECTED_KEY);
    return { status: 'sent', unchanged: reply.unchanged === true, ignored: reply.ignored === true };
  }
  if (response.status === 403 && /insufficient_scope/.test(response.headers.get('WWW-Authenticate') ?? '')) {
    deps.storage.setItem(BOARD_NEEDS_SCOPE_KEY, '1'); // tokens stay: inbox and sync keep working
    return { status: 'needs_scope' };
  }
  if (response.status === 401 || response.status === 403) {
    clearTokens(deps);
    throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
  }
  if (response.status === 400 || response.status === 413) {
    console.error(`[보드] Life Hub가 목록을 받지 않았어요 (${response.status}). 같은 내용은 다시 보내지 않아요.`);
    deps.storage.setItem(REJECTED_KEY, sha);
    deps.storage.removeItem(PENDING_KEY);
    return { status: 'rejected', httpStatus: response.status };
  }
  return { status: 'retry' };
}
