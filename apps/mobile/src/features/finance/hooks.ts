import { apiQuery } from '@fp/api-client';
import type { Category } from '@fp/contracts';
import { type CurrencyCode, currencyExponent, formatMoney, money } from '@fp/domain/money';
import { categoryLabel } from '@fp/i18n';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale, useLocale } from '@/i18n';
import { api } from '@/lib/api';
import type { AmountFormat } from './amount-input';

export function useOverview(enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'finance', 'overview', { params: { householdId } }),
    enabled,
  });
}

export function useAccounts() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'finance', 'listAccounts', { params: { householdId } }));
}

export function useCategories() {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'finance', 'listCategories', { params: { householdId } }),
    staleTime: 10 * 60_000,
  });
}

export function useBudgets() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'finance', 'listBudgets', { params: { householdId } }));
}

const PAGE_SIZE = 50;

/** Cursor-paginated transactions (newest first) for FlashList infinite scrolling. */
export function useTransactions(accountId?: string) {
  const { householdId } = useHousehold();
  return useInfiniteQuery({
    queryKey: ['finance', 'listTransactions', { householdId, accountId: accountId ?? null }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.finance.listTransactions({
        params: { householdId },
        query: {
          limit: PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(accountId ? { accountId } : {}),
        },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Formats integer minor units in the household currency (or a given one). */
export function useMoney() {
  const { household } = useHousehold();
  const intlLocale = useIntlLocale();
  return useCallback(
    (amountMinor: number, currency: CurrencyCode = household.currency) =>
      formatMoney(money(amountMinor, currency), intlLocale),
    [household.currency, intlLocale],
  );
}

export function useAmountFormat(currency?: CurrencyCode): AmountFormat {
  const { household } = useHousehold();
  const locale = useLocale();
  return { exponent: currencyExponent(currency ?? household.currency), style: locale };
}

/** Category id → translated label (system categories by key, custom ones by name, with parent). */
export function useCategoryLabels(): Map<string, string> {
  const { data } = useCategories();
  const locale = useLocale();
  return useMemo(() => {
    const byId = new Map<string, Category>((data ?? []).map((c) => [c.id, c]));
    const labels = new Map<string, string>();
    for (const c of data ?? []) {
      const own = categoryLabel(locale, c);
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      labels.set(c.id, parent ? `${categoryLabel(locale, parent)} › ${own}` : own);
    }
    return labels;
  }, [data, locale]);
}
