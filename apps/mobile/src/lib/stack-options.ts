import { Platform } from 'react-native';
import type { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { useColors } from './theme';

type StackScreenOptions = Exclude<
  ComponentProps<typeof Stack>['screenOptions'],
  ((...args: never[]) => unknown) | undefined
>;

/** Themed header/content options shared by every feature stack. */
export function useStackScreenOptions(): StackScreenOptions {
  const colors = useColors();
  return {
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.text,
    headerTitleStyle: { color: colors.text },
    contentStyle: { backgroundColor: colors.background },
    headerBackButtonDisplayMode: 'minimal',
  };
}

/**
 * Modal screens: native sheets on iOS. On Android, `presentation: 'modal'` stacked on the nested
 * tab navigator can stay invisible (seen on a real emulator), so use a card sliding up instead.
 */
export const modalPresentation =
  Platform.OS === 'android'
    ? ({ presentation: 'card', animation: 'slide_from_bottom' } as const)
    : ({ presentation: 'modal' } as const);
