import {
  isLocale,
  type Locale,
  negotiateLocale,
  resources as shared,
  toIntlLocale,
} from '@fp/i18n';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { useEffect } from 'react';
import { initReactI18next, useTranslation } from 'react-i18next';
import { useSettings } from '@/features/settings/settings-store';
import { mobileDe } from './de';
import { mobileEn } from './en';

/** Supported locale closest to the device's preferred languages (German by default). */
export function deviceLocale(): Locale {
  try {
    return negotiateLocale(getLocales().map((l) => l.languageTag));
  } catch {
    return negotiateLocale(null);
  }
}

void i18n.use(initReactI18next).init({
  // Shared strings from @fp/i18n plus mobile-only strings under `m.`.
  resources: {
    de: { translation: { ...shared.de, m: mobileDe } },
    en: { translation: { ...shared.en, m: mobileEn } },
  },
  lng: deviceLocale(),
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export { i18n };

/** The active UI locale. */
export function useLocale(): Locale {
  const { i18n: instance } = useTranslation();
  return isLocale(instance.language) ? instance.language : 'de';
}

export function useIntlLocale(): string {
  return toIntlLocale(useLocale());
}

/** Keeps i18next in sync with the language setting. */
export function useApplyLocaleSetting(): void {
  const preference = useSettings((s) => s.locale);
  useEffect(() => {
    const next = preference === 'system' ? deviceLocale() : preference;
    if (i18n.language !== next) void i18n.changeLanguage(next);
  }, [preference]);
}
