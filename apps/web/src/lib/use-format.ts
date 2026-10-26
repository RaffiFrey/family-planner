'use client';

import type { CurrencyCode } from '@fp/domain/money';
import {
  currencyExponent,
  formatMoney,
  minorToDecimalString,
  parseAmountToMinor,
} from '@fp/domain/money';
import { formatDate, formatTime, toIntlLocale } from '@fp/i18n';
import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { useHousehold } from '@/features/household/household-context';

/** Locale- and household-aware formatting. Money is always integer minor units. */
export function useFormat() {
  const locale = useLocale();
  const { household } = useHousehold();
  return useMemo(() => {
    const timeZone = household.timezone;
    const intlLocale = toIntlLocale(locale);
    return {
      locale,
      intlLocale,
      timeZone,
      currency: household.currency,
      money: (amountMinor: number, currency: CurrencyCode = household.currency) =>
        formatMoney({ amountMinor, currency }, intlLocale),
      /** Throws MoneyError when the input cannot be parsed. */
      parseMoney: (input: string, currency: CurrencyCode = household.currency) =>
        parseAmountToMinor(input, currencyExponent(currency), locale === 'de' ? 'de' : 'en'),
      /** Minor units to an editable input string ("12,50"). */
      moneyInput: (amountMinor: number, currency: CurrencyCode = household.currency) => {
        const s = minorToDecimalString(amountMinor, currencyExponent(currency));
        return locale === 'de' ? s.replace('.', ',') : s;
      },
      date: (v: Date | string, options?: Intl.DateTimeFormatOptions) =>
        formatDate(v, locale, timeZone, options),
      time: (v: Date | string) => formatTime(v, locale, timeZone),
      dateTime: (v: Date | string) =>
        formatDate(v, locale, timeZone, { dateStyle: 'medium', timeStyle: 'short' }),
      number: (n: number) => new Intl.NumberFormat(intlLocale).format(n),
    };
  }, [locale, household.timezone, household.currency]);
}
