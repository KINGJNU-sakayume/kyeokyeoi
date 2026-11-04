import { useSyncExternalStore } from 'react';
import type { LifeHubErrorKind, Proposal } from './lifehub';
import { browserDeps, isConnected } from './lifehub';

/** Shared Life Hub state for the agent, the Settings section and the proposals sheet. */
export interface LifeHubState {
  connected: boolean;
  syncing: boolean;
  proposals: Proposal[];
  conflicts: number;
  error: string;
  /** Kind of the last failure; empty after a successful run. */
  errorKind: LifeHubErrorKind | '';
  /** The connection was lost (token missing or refused) while this page was open: 「확인 필요」. */
  reauth: boolean;
  lastSyncedAt: number | null;
}

let state: LifeHubState = {
  connected: typeof localStorage !== 'undefined' && isConnected(browserDeps()),
  syncing: false,
  proposals: [],
  conflicts: 0,
  error: '',
  errorKind: '',
  reauth: false,
  lastSyncedAt: null,
};
const listeners = new Set<() => void>();

export function getLifeHubState(): LifeHubState {
  return state;
}
export function setLifeHubState(patch: Partial<LifeHubState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useLifeHub(): LifeHubState {
  return useSyncExternalStore(subscribe, getLifeHubState, getLifeHubState);
}

export const SYNC_EVENT = 'lifehub-sync';
/** Ask the agent to send pending receipts/rejections and refresh proposals. */
export function requestLifeHubSync(quiet = true) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { quiet } }));
}

/** A: not connected · B: connected · C: connected but needs the owner's attention (reconnect). */
export type HubPhase = 'A' | 'B' | 'C';
export function hubPhase(s: Pick<LifeHubState, 'connected' | 'reauth'>): HubPhase {
  if (s.reauth) return 'C';
  return s.connected ? 'B' : 'A';
}

const pad = (n: number) => String(n).padStart(2, '0');
/** The status line of state B. */
export function statusLine(
  s: Pick<LifeHubState, 'syncing' | 'errorKind' | 'lastSyncedAt'>,
  now: number = Date.now(),
): string {
  if (s.syncing) return '연결됨 · 동기화 중…';
  if (s.errorKind === 'network' || s.errorKind === 'server') return '연결됨 · 잠시 뒤 다시 시도';
  if (s.lastSyncedAt == null) return '연결됨 · 아직 동기화 전';
  const t = new Date(s.lastSyncedAt);
  const n = new Date(now);
  const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const today = t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth() && t.getDate() === n.getDate();
  return `연결됨 · ${today ? '오늘' : `${t.getMonth() + 1}월 ${t.getDate()}일`} ${hm} 동기화`;
}

/** Accessible name of the entry that opens Settings; state C adds the warning. */
export function settingsEntryLabel(base: string, phase: HubPhase): string {
  return phase === 'C' ? `${base} (확인 필요)` : base;
}
