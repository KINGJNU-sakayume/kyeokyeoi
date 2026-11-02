import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getMemories,
  getSetting,
  setSetting,
  getRegionVisits,
  getCollections,
  getLifePeriods,
  repository,
} from './db/index';
import type { Memory, RegionVisit, MemoryCollection, LifePeriod } from './db/index';
import { applyTheme } from './theme/index';
import type { Theme } from './theme/index';
import { AppContext } from './AppContext';
import type { AppContextValue, Route, SheetPrefill, Tab } from './AppContext';
import OnboardingFlow from './views/OnboardingFlow';
import MainLayout from './views/MainLayout';
import MemoryDetailView from './views/MemoryDetailView';
import AddMemorySheet from './components/AddMemorySheet';
import { LifeHubAgent } from './components/LifeHub';
import { isAuthCallback } from './integration/lifehub';

import { applyPwaUpdate, subscribePwa } from './pwa';

const TABS: Tab[] = ['map', 'timeline', 'memories', 'collections', 'settings'];

function routeToHash(r: Route): string {
  if (r.type === 'detail') return `#/memory/${encodeURIComponent(r.memoryId)}`;
  if (r.type === 'main') return `#/${r.tab}`;
  return '';
}

function hashToRoute(hash: string): Route {
  const m = /^#\/memory\/(.+)$/.exec(hash);
  if (m) {
    try {
      return { type: 'detail', memoryId: decodeURIComponent(m[1]) };
    } catch {
      return { type: 'main', tab: 'map' };
    }
  }
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
  // Returning from Life Hub sign-in lands on the app root with ?code&state: show Settings while it finishes.
  const [route, setRoute] = useState<Route>(() =>
    isAuthCallback(location.search) ? { type: 'main', tab: 'settings' } : hashToRoute(location.hash),
  );
  const [memories, setMemories] = useState<Memory[]>([]);
  const [visits, setVisits] = useState<RegionVisit[]>([]);
  const [collections, setCollections] = useState<MemoryCollection[]>([]);
  const [periods, setPeriods] = useState<LifePeriod[]>([]);
  const [mapMode, setMapMode] = useState<'visits' | 'memories'>('visits');
  const [pickedRegion, pickRegion] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [birthYear, setBirthYearState] = useState<number | null>(null);
  const [theme, setThemeState] = useState<Theme>('A');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [
          done,
          savedTheme,
          savedBirthYear,
          saved,
          savedVisits,
          savedCollections,
          savedPeriods,
        ] = await Promise.all([
          getSetting<boolean>('onboarding_done'),
          getSetting<Theme>('app_theme'),
          getSetting<number>('birth_year'),
          getMemories(),
          getRegionVisits(),
          getCollections(),
          getLifePeriods(),
        ]);
        const t = savedTheme && ['A', 'B', 'C', 'D'].includes(savedTheme) ? savedTheme : 'A';
        applyTheme(t);
        setThemeState(t);
        setBirthYearState(savedBirthYear ?? null);
        setMemories(saved);
        setVisits(savedVisits);
        setCollections(savedCollections);
        setPeriods(savedPeriods);
        setOnboarded(!!done || saved.length > 0 || savedVisits.length > 0);
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
    const [m, v, c, p] = await Promise.all([
      getMemories(),
      getRegionVisits(),
      getCollections(),
      getLifePeriods(),
    ]);
    setMemories(m);
    setVisits(v);
    setCollections(c);
    setPeriods(p);
    const [t, y] = await Promise.all([
      getSetting<Theme>('app_theme'),
      getSetting<number>('birth_year'),
    ]);
    if (t && ['A', 'B', 'C', 'D'].includes(t)) {
      applyTheme(t);
      setThemeState(t);
    }
    if (y !== undefined) setBirthYearState(y);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setStorageStatus((e as CustomEvent<string>).detail);
    const refresh = () => {
      if (!document.hidden) refreshMemories().catch(() => {});
    };
    window.addEventListener('storage-status', handler);
    document.addEventListener('visibilitychange', refresh);
    const unsubscribe = subscribePwa(setUpdateReady);
    return () => {
      window.removeEventListener('storage-status', handler);
      document.removeEventListener('visibilitychange', refresh);
      unsubscribe();
    };
  }, [refreshMemories]);

  const setBirthYear = useCallback(
    async (year: number) => {
      await repository.recomputeBirthYear(year);
      await refreshMemories();
      setBirthYearState(year);
    },
    [refreshMemories],
  );

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

  const goBack = useCallback(
    (fallback: Route) => {
      if (stackIndex() > 0) {
        history.back();
      } else {
        navigate(fallback, { replace: true });
      }
    },
    [navigate],
  );

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const openAddSheet = useCallback(
    (prefill?: SheetPrefill) => setSheet({ mode: 'add', prefill }),
    [],
  );
  const openEditSheet = useCallback((id: string) => setSheet({ mode: 'edit', id }), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  const ctx: AppContextValue = useMemo(
    () => ({
      memories,
      refreshMemories,
      refreshArchive: refreshMemories,
      visits,
      collections,
      periods,
      mapMode,
      setMapMode,
      pickedRegion,
      pickRegion,
      archiveTarget,
      setArchiveTarget,
      birthYear,
      setBirthYear,
      theme,
      setTheme,
      route,
      navigate,
      goBack,
      openAddSheet,
      openEditSheet,
      closeSheet,
      showToast,
    }),
    [
      memories,
      refreshMemories,
      visits,
      collections,
      periods,
      mapMode,
      pickedRegion,
      archiveTarget,
      birthYear,
      setBirthYear,
      theme,
      setTheme,
      route,
      navigate,
      goBack,
      openAddSheet,
      openEditSheet,
      closeSheet,
      showToast,
    ],
  );

  if (!ready)
    return (
      <div className="screen" aria-busy="true">
        <p className="app-notice" role="status">
          {storageStatus ?? '기록을 여는 중이에요.'}
        </p>
      </div>
    );

  if (loadError) {
    return (
      <div className="empty">
        <p className="empty__title">기록을 열지 못했어요</p>
        <p className="empty__body">
          원본 데이터를 삭제하지 말고 다른 켜켜이 탭을 닫은 뒤 다시 시도해 주세요. ({loadError})
        </p>
        <a href={`${import.meta.env.BASE_URL}recovery.html`}>원본 백업 복구 화면 열기</a>
      </div>
    );
  }

  return (
    <AppContext.Provider value={ctx}>
      <LifeHubAgent />
      {storageStatus && (
        <div className="app-notice" role="status">
          {storageStatus}
          <button className="text-btn" onClick={() => location.reload()}>
            새로고침
          </button>
        </div>
      )}
      {updateReady && !sheet && (
        <div className="app-notice" role="status">
          새 버전이 준비됐어요.
          <button
            className="text-btn"
            onClick={async () => {
              await repository.close();
              await applyPwaUpdate(true);
            }}
          >
            업데이트
          </button>
        </div>
      )}
      {!onboarded ? (
        <OnboardingFlow
          onDone={() => {
            setOnboarded(true);
            navigate({ type: 'main', tab: 'map' }, { replace: true });
          }}
        />
      ) : route.type === 'detail' ? (
        <MemoryDetailView key={`detail:${route.memoryId}`} memoryId={route.memoryId} />
      ) : (
        <MainLayout tab={route.type === 'main' ? route.tab : 'map'} />
      )}
      {sheet && (
        <AddMemorySheet
          key={sheet.mode === 'edit' ? `edit:${sheet.id}` : 'new'}
          editId={sheet.mode === 'edit' ? sheet.id : null}
          prefill={sheet.mode === 'add' ? sheet.prefill : undefined}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </AppContext.Provider>
  );
}
