const { palette, MEMBER_COLORS } = require('@fp/ui-tokens');

/**
 * Semantic colors are CSS variables; `ThemeRoot` sets them from `@fp/ui-tokens` themes at runtime,
 * so `bg-background`, `text-muted` etc. follow the light/dark/system setting.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: palette.brand,
        neutral: palette.neutral,
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-muted': 'var(--color-surface-muted)',
        border: 'var(--color-border)',
        text: 'var(--color-text)',
        muted: 'var(--color-text-muted)',
        primary: 'var(--color-primary)',
        'primary-text': 'var(--color-primary-text)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        member: Object.fromEntries(MEMBER_COLORS.map((c, i) => [String(i), c])),
      },
      borderRadius: { sm: '6px', md: '10px', lg: '14px' },
    },
  },
  plugins: [],
};
