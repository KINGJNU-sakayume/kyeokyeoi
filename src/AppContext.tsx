import { createContext, useContext } from 'react';
import type { Memory } from './db/index';
import type { Theme } from './theme/index';

export type Tab = 'map' | 'timeline' | 'settings';

export type Route =
  | { type: 'onboarding' }
  | { type: 'main'; tab: Tab }
  | { type: 'detail'; memoryId: string };

export interface SheetPrefill {
  regionCode: string;
  regionLabel: string;
}

export interface AppContextValue {
  memories: Memory[];
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
