import { themes, type ThemeName } from '@fp/ui-tokens';
import { StatusBar } from 'expo-status-bar';
import { vars } from 'nativewind';
import type { ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';
import { useSettings } from '@/features/settings/settings-store';

export function useThemeName(): ThemeName {
  const system = useColorScheme();
  const preference = useSettings((s) => s.theme);
  if (preference === 'system') return system === 'dark' ? 'dark' : 'light';
  return preference;
}

/** Semantic colors for places that need raw values (icons, navigation headers, placeholders). */
export function useColors(): (typeof themes)[ThemeName] {
  return themes[useThemeName()];
}

function cssVars(name: ThemeName) {
  const c = themes[name];
  return vars({
    '--color-background': c.background,
    '--color-surface': c.surface,
    '--color-surface-muted': c.surfaceMuted,
    '--color-border': c.border,
    '--color-text': c.text,
    '--color-text-muted': c.textMuted,
    '--color-primary': c.primary,
    '--color-primary-text': c.primaryText,
    '--color-success': c.success,
    '--color-warning': c.warning,
    '--color-danger': c.danger,
  });
}

const VARS = { light: cssVars('light'), dark: cssVars('dark') };

/** Applies the theme's CSS variables so NativeWind classes like `bg-background` follow the setting. */
export function ThemeRoot({ children }: { children: ReactNode }) {
  const name = useThemeName();
  return (
    <View style={[{ flex: 1, backgroundColor: themes[name].background }, VARS[name]]}>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      {children}
    </View>
  );
}
