/**
 * 켜켜이 → Life Board tile list (manifest v1, see the board repo's docs/TILES.md).
 *
 * Only one tile: `regions`, a grid of the 17 시도 with the ones visited marked. It carries no memory
 * titles, places or photos, so nothing personal beyond "which 시도 were visited" leaves the device.
 *
 * `buildBoardTiles` is pure: no network, no storage, no randomness. The same input gives the same
 * output, which the upload relies on to skip sending an unchanged list.
 */
import type { RegionVisit } from '../db/model';
import { PROVINCES } from '../map/geodata';
import { APP_URL } from './lifehub';

export const BOARD_APP = 'kyeokyeoi';

export type CellState = 'none' | 'off' | 'on' | 'last';
export interface BoardTile {
  id: string;
  name: string;
  tone: 'map';
  sizes: string[];
  size: string;
  default: boolean;
  href: string;
  data: { label: string; summary: string; cols: number; cells: { state: CellState; name?: string }[] };
}
export interface BoardManifest {
  version: 1;
  app: typeof BOARD_APP;
  generated_at: string;
  tiles: BoardTile[];
}
export interface BoardState {
  visits: Pick<RegionVisit, 'regionCode' | 'visitedOn' | 'recordedAt'>[];
}

/** Grid: 6 columns, 시도 codes in a rough north-to-south layout; `null` is an empty cell. */
export const GRID_COLS = 6;
export const GRID: (string | null)[] = [
  '23', '11', '31', '32', '37', '26',
  '34', '25', '29', '33', '22', '21',
  '35', '24', '36', '38', null, '39',
];

const SHORT = new Map(PROVINCES.map((p) => [p.code, p.short]));
const KST_MS = 9 * 60 * 60 * 1000;

/** Cuts to `max` UTF-16 units (JavaScript `.length`, as the board counts) and drops empty text. */
export function clip(text: string | undefined, max: number): string | undefined {
  const t = text?.trim();
  return t ? t.slice(0, max) : undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');
function ymd(ms: number): string {
  const d = new Date(ms + KST_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** The day of a visit: the date the owner gave, else the day it was recorded (Korea time). */
function visitDay(v: BoardState['visits'][number]): string {
  return v.visitedOn && /^\d{4}-\d{2}-\d{2}$/.test(v.visitedOn) ? v.visitedOn : ymd(v.recordedAt);
}
const monthDay = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;

function regionsTile(state: BoardState): BoardTile {
  const visited = new Set<string>();
  let last: { prov: string; day: string; recordedAt: number } | null = null;
  for (const v of state.visits) {
    const prov = v.regionCode.slice(0, 2);
    if (!SHORT.has(prov)) continue; // a code this app no longer knows has no cell
    visited.add(prov);
    const cand = { prov, day: visitDay(v), recordedAt: v.recordedAt };
    if (
      !last ||
      cand.day > last.day ||
      (cand.day === last.day && (cand.recordedAt > last.recordedAt || (cand.recordedAt === last.recordedAt && cand.prov > last.prov)))
    )
      last = cand;
  }
  const cells = GRID.map((code) => {
    if (code === null) return { state: 'none' as const };
    const name = clip(SHORT.get(code), 6);
    const st: CellState = code === last?.prov ? 'last' : visited.has(code) ? 'on' : 'off';
    return name ? { state: st, name } : { state: st };
  });
  const total = PROVINCES.length;
  const summary = last
    ? `${total}개 시도 중 ${visited.size}곳 방문 · 마지막 ${monthDay(last.day)} ${SHORT.get(last.prov)}`
    : `${total}개 시도 중 아직 방문한 곳이 없어요`;
  return {
    id: 'regions',
    name: '켜켜이 · 지역 방문',
    tone: 'map',
    sizes: ['2x2', '2x1'],
    size: '2x2',
    default: true,
    href: APP_URL + '#/map',
    data: { label: '지역 방문', summary: clip(summary, 80) ?? '지역 방문', cols: GRID_COLS, cells },
  };
}

export function buildBoardTiles(state: BoardState, now: number): BoardManifest {
  return { version: 1, app: BOARD_APP, generated_at: new Date(now).toISOString(), tiles: [regionsTile(state)] };
}

/** The part of the list that decides whether it changed: everything except `generated_at`. */
export function boardBody(manifest: BoardManifest): string {
  return JSON.stringify(manifest, (k, v) => (k === 'generated_at' ? undefined : v));
}
