import { DEFAULT_LOCALE, isLocale, negotiateLocale } from '@fp/i18n';
import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { getMessages } from '@/messages';
import { LOCALE_COOKIE } from './locale';

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : negotiateLocale((await headers()).get('accept-language') ?? DEFAULT_LOCALE);
  return { locale, messages: getMessages(locale) };
});
