import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Locale } from '@fp/i18n';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';
export type LocalePreference = 'system' | Locale;

interface SettingsState {
  theme: ThemePreference;
  locale: LocalePreference;
  /** Require Face ID / fingerprint before showing finance and files. */
  biometricLock: boolean;
  activeHouseholdId: string | null;
  /** Invite token opened via deep link before signing in. */
  pendingInviteToken: string | null;
  setTheme: (theme: ThemePreference) => void;
  setLocale: (locale: LocalePreference) => void;
  setBiometricLock: (on: boolean) => void;
  setActiveHouseholdId: (id: string | null) => void;
  setPendingInviteToken: (token: string | null) => void;
}

/** Small device-local UI preferences (server state lives in TanStack Query). */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      locale: 'system',
      biometricLock: false,
      activeHouseholdId: null,
      pendingInviteToken: null,
      setTheme: (theme) => {
        set({ theme });
      },
      setLocale: (locale) => {
        set({ locale });
      },
      setBiometricLock: (biometricLock) => {
        set({ biometricLock });
      },
      setActiveHouseholdId: (activeHouseholdId) => {
        set({ activeHouseholdId });
      },
      setPendingInviteToken: (pendingInviteToken) => {
        set({ pendingInviteToken });
      },
    }),
    {
      name: 'fp-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ theme, locale, biometricLock, activeHouseholdId, pendingInviteToken }) => ({
        theme,
        locale,
        biometricLock,
        activeHouseholdId,
        pendingInviteToken,
      }),
    },
  ),
);
