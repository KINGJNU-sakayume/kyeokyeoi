import { createContext, useContext } from 'react';
import type { Memory } from './db/index';
import type { Theme } from './theme/index';

// ============================================================
// Routing Types
// ============================================================

export type Tab = 'map' | 'timeline' | 'settings';

export type Route =
  | { type: 'onboarding' }
  | { type: 'main'; tab: Tab }
  | { type: 'detail'; memoryId: string };

// ============================================================
// App Context
// ============================================================

export interface AppContextValue {
  memories: Memory[];
  refreshMemories: () => Promise<void>;
  birthYear: number | null;
  setBirthYear: (year: number) => Promise<void>;
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  navigate: (route: Route) => void;
  route: Route;
  openAddSheet: () => void;
  closeAddSheet: () => void;
  addSheetOpen: boolean;
  addSheetEditId: string | null;
  openEditSheet: (id: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
