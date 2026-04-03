import { useCallback, useEffect, useState } from 'react';
import { getMemories, getSetting, setSetting } from './db/index';
import type { Memory } from './db/index';
import { applyTheme } from './theme/index';
import type { Theme } from './theme/index';
import { AppContext } from './AppContext';
import type { AppContextValue, Route } from './AppContext';
import OnboardingFlow from './views/OnboardingFlow';
import MainLayout from './views/MainLayout';
import MemoryDetailView from './views/MemoryDetailView';

export default function App() {
  const [route, setRoute] = useState<Route>({ type: 'onboarding' });
  const [memories, setMemories] = useState<Memory[]>([]);
  const [birthYear, setBirthYearState] = useState<number | null>(null);
  const [theme, setThemeState] = useState<Theme>('A');
  const [loading, setLoading] = useState(true);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [addSheetEditId, setAddSheetEditId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [done, savedTheme, savedBirthYear, savedMemories] = await Promise.all([
          getSetting<boolean>('onboarding_done'),
          getSetting<Theme>('app_theme'),
          getSetting<number>('birth_year'),
          getMemories(),
        ]);

        const activeTheme = savedTheme ?? 'A';
        applyTheme(activeTheme);
        setThemeState(activeTheme);
        setBirthYearState(savedBirthYear ?? null);
        setMemories(savedMemories);

        if (done) {
          setRoute({ type: 'main', tab: 'map' });
        } else {
          setRoute({ type: 'onboarding' });
        }
      } catch (e) {
        console.error('Init failed', e);
        setRoute({ type: 'onboarding' });
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const refreshMemories = useCallback(async () => {
    try {
      const updated = await getMemories();
      setMemories(updated);
    } catch (e) {
      console.error('refreshMemories failed', e);
    }
  }, []);

  const handleSetBirthYear = useCallback(async (year: number) => {
    await setSetting('birth_year', year);
    setBirthYearState(year);
  }, []);

  const handleSetTheme = useCallback(async (t: Theme) => {
    await setSetting('app_theme', t);
    applyTheme(t);
    setThemeState(t);
  }, []);

  const navigate = useCallback((r: Route) => setRoute(r), []);
  const openAddSheet = useCallback(() => { setAddSheetEditId(null); setAddSheetOpen(true); }, []);
  const closeAddSheet = useCallback(() => { setAddSheetOpen(false); setAddSheetEditId(null); }, []);
  const openEditSheet = useCallback((id: string) => { setAddSheetEditId(id); setAddSheetOpen(true); }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--color-primary)', fontSize: '24px', fontWeight: 600,
      }}>
        켜켜이
      </div>
    );
  }

  const ctx: AppContextValue = {
    memories, refreshMemories,
    birthYear, setBirthYear: handleSetBirthYear,
    theme, setTheme: handleSetTheme,
    navigate, route,
    openAddSheet, closeAddSheet, addSheetOpen, addSheetEditId, openEditSheet,
  };

  return (
    <AppContext.Provider value={ctx}>
      {route.type === 'onboarding' && <OnboardingFlow />}
      {route.type === 'main' && <MainLayout tab={route.tab} />}
      {route.type === 'detail' && <MemoryDetailView memoryId={route.memoryId} />}
    </AppContext.Provider>
  );
}
