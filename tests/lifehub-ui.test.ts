import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/AppContext';
import type { AppContextValue } from '../src/AppContext';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('sessionStorage', memoryStorage());
// The tabs are not under test; only the settings entry in MainLayout is.
for (const tab of ['MapTab', 'TimelineTab', 'MemoriesTab', 'CollectionsTab', 'SettingsTab'])
  vi.doMock(`../src/views/${tab}`, () => ({ default: () => null }));
vi.stubGlobal('location', { origin: 'https://kingjnu-sakayume.github.io', pathname: '/kyeokyeoi/', search: '', hash: '' });

const { LifeHubSection } = await import('../src/components/LifeHub');
const MainLayout = (await import('../src/views/MainLayout')).default;
const { getLifeHubState, hubPhase, setLifeHubState, settingsEntryLabel, statusLine } = await import('../src/integration/lifehubStore');

const ctx = { showToast() {}, navigate() {}, setArchiveTarget() {} } as unknown as AppContextValue;
const inApp = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(AppContext.Provider, { value: ctx }, el));
const section = () => inApp(createElement(LifeHubSection));
const proposal = (n: number) =>
  ({ key: `claude:mcp-${String(n).padStart(8, '0')}`, type: 'visit', source: 'claude', status: 'pending', payload: { place_text: 'x' } }) as never;
const reset = () =>
  setLifeHubState({ connected: false, reauth: false, syncing: false, proposals: [], conflicts: 0, error: '', errorKind: '', lastSyncedAt: null });

beforeEach(reset);

describe('Life Hub settings section', () => {
  it('(1) renders no proposal entry point at 0 proposals, and shows the count from 1', () => {
    setLifeHubState({ connected: true });
    expect(section()).not.toContain('Claude가 제안한 기록');
    setLifeHubState({ proposals: [proposal(1), proposal(2)] });
    const html = section();
    expect(html).toContain('Claude가 제안한 기록');
    expect(html).toContain('검토할 제안 2개');
  });

  it('(2) state C marks the settings entry with a dot and "(확인 필요)"', () => {
    const entry = () => inApp(createElement(MainLayout, { tab: 'map' }));
    setLifeHubState({ connected: true });
    expect(entry()).toContain('aria-label="설정 열기"');
    expect(entry()).not.toContain('attn-dot');
    setLifeHubState({ connected: false, reauth: true });
    const html = entry();
    expect(html).toContain('aria-label="설정 열기 (확인 필요)"');
    expect(html).toContain('attn-dot');
    expect(section()).toContain('확인 필요');
    expect(section()).toContain('다시 연결');
    reset();
    expect(entry()).not.toContain('attn-dot');
  });

  it('(3) before connecting, the connect button exists in the section only', () => {
    const html = section();
    expect(html).toContain('Claude가 제안한 기록을 받습니다.');
    expect(html.match(/Life Hub 연결</g)).toHaveLength(1);
    expect(inApp(createElement(MainLayout, { tab: 'map' }))).not.toContain('Life Hub 연결');
  });

  it('keeps connected state to the standard order and has no sync on/off control or 고급 area', () => {
    setLifeHubState({ connected: true, lastSyncedAt: Date.now() });
    const html = section();
    expect(html.indexOf('연결됨')).toBeLessThan(html.indexOf('지금 동기화'));
    expect(html.indexOf('지금 동기화')).toBeLessThan(html.indexOf('연결 해제'));
    expect(html.indexOf('연결 해제')).toBeLessThan(html.indexOf('Claude에서 승인한 기록은 바로 반영'));
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('동기화 켜기');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('클라우드');
  });
});

describe('Life Hub state helpers', () => {
  it('maps to phases A / B / C', () => {
    expect(hubPhase({ connected: false, reauth: false })).toBe('A');
    expect(hubPhase({ connected: true, reauth: false })).toBe('B');
    expect(hubPhase({ connected: false, reauth: true })).toBe('C');
  });
  it('writes the status line', () => {
    const now = new Date(2026, 10, 4, 15, 0).getTime();
    const base = { syncing: false, errorKind: '' as const, lastSyncedAt: null };
    expect(statusLine(base, now)).toBe('연결됨 · 아직 동기화 전');
    expect(statusLine({ ...base, syncing: true }, now)).toBe('연결됨 · 동기화 중…');
    expect(statusLine({ ...base, errorKind: 'network' }, now)).toBe('연결됨 · 잠시 뒤 다시 시도');
    expect(statusLine({ ...base, lastSyncedAt: new Date(2026, 10, 4, 9, 5).getTime() }, now)).toBe('연결됨 · 오늘 09:05 동기화');
    expect(statusLine({ ...base, lastSyncedAt: new Date(2026, 10, 3, 23, 40).getTime() }, now)).toBe('연결됨 · 11월 3일 23:40 동기화');
  });
  it('adds the warning to the settings entry name only in C', () => {
    expect(settingsEntryLabel('설정 열기', 'B')).toBe('설정 열기');
    expect(settingsEntryLabel('설정 열기', 'C')).toBe('설정 열기 (확인 필요)');
    expect(getLifeHubState().reauth).toBe(false);
  });
});
