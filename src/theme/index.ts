export const THEMES = ['A', 'B', 'C', 'D'] as const;
export type Theme = typeof THEMES[number];

export const THEME_NAMES: Record<Theme, string> = {
  A: '이끼·백자',
  B: '먹·한지',
  C: '새벽·청회',
  D: '황혼·모래',
};

export const THEME_COLORS: Record<Theme, { primary: string; primaryDeep: string; accent: string; mapBg: string }> = {
  A: { primary: '#4A7A5A', primaryDeep: '#2D5040', accent: '#C8874A', mapBg: '#D8EDE5' },
  B: { primary: '#3A3A38', primaryDeep: '#1C1C1A', accent: '#C04038', mapBg: '#E8E3D9' },
  C: { primary: '#2E5480', primaryDeep: '#1D3A58', accent: '#5E9B88', mapBg: '#D4E5F4' },
  D: { primary: '#7C5030', primaryDeep: '#5C3820', accent: '#C49A20', mapBg: '#EEE0CC' },
};

export const HEATMAP_COLORS: Record<Theme, [string, string, string, string]> = {
  A: ['#B8DFC5', '#7AAF8E', '#4A7A5A', '#2D5040'],
  B: ['#C8C6C2', '#9A9894', '#3A3A38', '#1C1C1A'],
  C: ['#B5CFEC', '#7AAAD8', '#2E5480', '#1D3A58'],
  D: ['#DEC4A8', '#C09872', '#7C5030', '#5C3820'],
};

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function getHeatmapColor(count: number, theme: Theme): string {
  if (count === 0) return '#DDDDD6';
  const stops = HEATMAP_COLORS[theme];
  if (count <= 2) return stops[0];
  if (count <= 5) return stops[1];
  if (count <= 10) return stops[2];
  return stops[3];
}
