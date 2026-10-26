/**
 * Design tokens shared by web (Tailwind v4 via tokens.css), admin and mobile (NativeWind).
 * Colors are OKLCH-free hex values so React Native can use them directly.
 */
export const palette = {
  brand: {
    50: '#eef6ff',
    100: '#d9eaff',
    200: '#bcdaff',
    300: '#8ec3ff',
    400: '#59a1ff',
    500: '#337dfc',
    600: '#1d5ef1',
    700: '#1549de',
    800: '#183cb4',
    900: '#1a378e',
  },
  neutral: {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#0284c7',
} as const;

/** Semantic colors per theme. */
export const themes = {
  light: {
    background: palette.neutral[0],
    surface: palette.neutral[50],
    surfaceMuted: palette.neutral[100],
    border: palette.neutral[200],
    text: palette.neutral[900],
    textMuted: palette.neutral[500],
    primary: palette.brand[600],
    primaryText: palette.neutral[0],
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
  },
  dark: {
    background: palette.neutral[950],
    surface: palette.neutral[900],
    surfaceMuted: palette.neutral[800],
    border: palette.neutral[700],
    text: palette.neutral[50],
    textMuted: palette.neutral[400],
    primary: palette.brand[400],
    primaryText: palette.neutral[950],
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#f87171',
  },
} as const;
export type ThemeName = keyof typeof themes;
export type SemanticColor = keyof (typeof themes)['light'];

/** Member colors offered in the UI (also used as defaults when creating members). */
export const MEMBER_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, full: 9999 } as const;
export const fontSize = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 } as const;

/** Budget level → semantic color. */
export const budgetLevelColor = { ok: 'success', warning: 'warning', exceeded: 'danger' } as const;
