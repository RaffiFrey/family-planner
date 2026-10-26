import type { Locale } from '@fp/i18n';
import type { AppMessages } from '@/messages';

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: AppMessages;
  }
}
