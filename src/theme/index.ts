export const THEMES = ['A', 'B', 'C', 'D'] as const;
export type Theme = typeof THEMES[number];

export const THEME_NAMES: Record<Theme, string> = {
  A: '이끼·백자',
  B: '먹·한지',
  C: '새벽·청회',
  D: '황혼·모래',
};

/** 설정 화면 견본용. 실제 색은 index.css의 [data-theme]에 있어요. */
export const THEME_SWATCH: Record<Theme, { paper: string; land: string; primary: string; deep: string; accent: string }> = {
  A: { paper: '#F5F7F3', land: '#DCE3DA', primary: '#3D6A4E', deep: '#203A2A', accent: '#2C4C8A' },
  B: { paper: '#F3F1EC', land: '#E0DCD2', primary: '#3A3935', deep: '#191917', accent: '#A8362B' },
  C: { paper: '#F2F5F8', land: '#DAE1EA', primary: '#2B4F7A', deep: '#15294A', accent: '#3D7566' },
  D: { paper: '#F7F2EB', land: '#E6DCCD', primary: '#8A5532', deep: '#4F2D14', accent: '#7F5A0E' },
};

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', THEME_SWATCH[theme].paper);
}
