import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMemories, getSetting, setSetting } from './db/index';
import type { Memory } from './db/index';
import { applyTheme } from './theme/index';
import type { Theme } from './theme/index';
import { AppContext } from './AppContext';
import type { AppContextValue, Route, SheetPrefill, Tab } from './AppContext';
import OnboardingFlow from './views/OnboardingFlow';
import MainLayout from './views/MainLayout';
import MemoryDetailView from './views/MemoryDetailView';
import AddMemorySheet from './components/AddMemorySheet';

const TABS: Tab[] = ['map', 'timeline', 'settings'];

function routeToHash(r: Route): string {
  if (r.type === 'detail') return `#/memory/${encodeURIComponent(r.memoryId)}`;
  if (r.type === 'main') return `#/${r.tab}`;
  return '';
}

function hashToRoute(hash: string): Route {
  const m = /^#\/memory\/(.+)$/.exec(hash);
  if (m) return { type: 'detail', memoryId: decodeURIComponent(m[1]) };
  const tab = hash.replace(/^#\//, '') as Tab;
  return { type: 'main', tab: TABS.includes(tab) ? tab : 'map' };
}

function stackIndex(): number {
  const k = (history.state as { k?: unknown } | null)?.k;
  return typeof k === 'number' ? k : 0;
}

type SheetState = { mode: 'add'; prefill?: SheetPrefill } | { mode: 'edit'; id: string } | null;

export default function App() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [route, setRoute] = useState<Route>(() => hashToRoute(location.hash));
  const [memories, setMemories] = useState<Memory[]>([]);
  const [birthYear, setBirthYearState] = useState<number | null>(null);
  const [theme, setThemeState] = useState<Theme>('A');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [done, savedTheme, savedBirthYear, saved] = await Promise.all([
          getSetting<boolean>('onboarding_done'),
          getSetting<Theme>('app_theme'),
          getSetting<number>('birth_year'),
          getMemories(),
        ]);
        const t = savedTheme ?? 'A';
        applyTheme(t);
        setThemeState(t);
        setBirthYearState(savedBirthYear ?? null);
        setMemories(saved);
        setOnboarded(!!done || saved.length > 0);
      } catch (e) {
        console.error('[켜켜이] 시작 실패', e);
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(hashToRoute(location.hash));
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  const refreshMemories = useCallback(async () => {
    setMemories(await getMemories());
  }, []);

  const setBirthYear = useCallback(async (year: number) => {
    await setSetting('birth_year', year);
    setBirthYearState(year);
  }, []);

  const setTheme = useCallback(async (t: Theme) => {
    applyTheme(t);
    setThemeState(t);
    await setSetting('app_theme', t);
  }, []);

  const navigate = useCallback((r: Route, opts?: { replace?: boolean }) => {
    if (r.type === 'onboarding') return;
    const hash = routeToHash(r);
    if (hash === location.hash) return;
    // history.state.k = 이 앱 안에서 몇 번 들어왔는지. 0이면 뒤로 가기가 앱 밖으로 나가요.
    const k = stackIndex();
    if (opts?.replace) history.replaceState({ k }, '', hash);
    else history.pushState({ k: k + 1 }, '', hash);
    setRoute(r);
  }, []);

  const goBack = useCallback((fallback: Route) => {
    if (stackIndex() > 0) {
      history.back();
    } else {
      navigate(fallback, { replace: true });
    }
  }, [navigate]);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const ctx: AppContextValue = useMemo(() => ({
    memories, refreshMemories,
    birthYear, setBirthYear,
    theme, setTheme,
    route, navigate, goBack,
    openAddSheet: (prefill?: SheetPrefill) => setSheet({ mode: 'add', prefill }),
    openEditSheet: (id: string) => setSheet({ mode: 'edit', id }),
    closeSheet: () => setSheet(null),
    showToast,
  }), [memories, refreshMemories, birthYear, setBirthYear, theme, setTheme, route, navigate, goBack, showToast]);

  if (!ready) return <div className="screen" aria-busy="true" />;

  if (loadError) {
    return (
      <div className="empty">
        <p className="empty__title">기록을 열지 못했어요</p>
        <p className="empty__body">
          브라우저 저장소에 접근할 수 없어요. 사생활 보호 모드라면 일반 창에서 열어 주세요. ({loadError})
        </p>
      </div>
    );
  }

  return (
    <AppContext.Provider value={ctx}>
      {!onboarded ? (
        <OnboardingFlow onDone={() => { setOnboarded(true); navigate({ type: 'main', tab: 'map' }, { replace: true }); }} />
      ) : route.type === 'detail' ? (
        <MemoryDetailView key={route.memoryId} memoryId={route.memoryId} />
      ) : (
        <MainLayout tab={route.type === 'main' ? route.tab : 'map'} />
      )}
      {sheet && (
        <AddMemorySheet
          key={sheet.mode === 'edit' ? sheet.id : 'new'}
          editId={sheet.mode === 'edit' ? sheet.id : null}
          prefill={sheet.mode === 'add' ? sheet.prefill : undefined}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </AppContext.Provider>
  );
}
