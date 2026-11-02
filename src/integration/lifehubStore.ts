import { useSyncExternalStore } from 'react';
import type { Proposal } from './lifehub';
import { browserDeps, isConnected } from './lifehub';

/** Shared Life Hub state for the agent, the Settings section and the proposals sheet. */
export interface LifeHubState {
  connected: boolean;
  syncing: boolean;
  proposals: Proposal[];
  conflicts: number;
  error: string;
  lastSyncedAt: number | null;
}

let state: LifeHubState = {
  connected: typeof localStorage !== 'undefined' && isConnected(browserDeps()),
  syncing: false,
  proposals: [],
  conflicts: 0,
  error: '',
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
