import { createContext, useContext } from 'react';
import type { Memory, RegionVisit, MemoryCollection, LifePeriod, SourceReference, TimeType, TimeValue } from './db/index';
import type { Theme } from './theme/index';

export type Tab = 'map' | 'timeline' | 'memories' | 'collections' | 'settings';

export type Route =
  { type: 'onboarding' } | { type: 'main'; tab: Tab } | { type: 'detail'; memoryId: string };

export interface SheetPrefill {
  regionCode?: string | null;
  regionLabel?: string | null;
  /** From a Life Hub proposal: the owner still reviews everything before saving. */
  title?: string;
  memo?: string;
  timeType?: TimeType | null;
  timeValue?: TimeValue | null;
  emotions?: string[];
  /** Search text for the region picker (the place in the user's own words). */
  placeQuery?: string;
  /** Saved with the memory in the same transaction; it is the Life Hub receipt. */
  source?: SourceReference;
}

export interface AppContextValue {
  memories: Memory[];
  visits: RegionVisit[];
  collections: MemoryCollection[];
  periods: LifePeriod[];
  refreshArchive: () => Promise<void>;
  mapMode: 'visits' | 'memories';
  setMapMode: (mode: 'visits' | 'memories') => void;
  pickedRegion: string | null;
  pickRegion: (code: string | null) => void;
  archiveTarget: string | null;
  setArchiveTarget: (id: string | null) => void;
  refreshMemories: () => Promise<void>;
  birthYear: number | null;
  setBirthYear: (year: number) => Promise<void>;
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  route: Route;
  /** 주소(#/...)를 바꿔 이동해요. 브라우저 뒤로 가기가 그대로 동작해요. */
  navigate: (route: Route, opts?: { replace?: boolean }) => void;
  /** 앱 안에서 온 화면이면 이전 화면으로, 아니면 fallback으로 */
  goBack: (fallback: Route) => void;
  openAddSheet: (prefill?: SheetPrefill) => void;
  openEditSheet: (id: string) => void;
  closeSheet: () => void;
  showToast: (message: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
