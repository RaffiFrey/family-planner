'use client';

import { apiQuery, type Output } from '@fp/api-client';
import type { Account, Category } from '@fp/contracts';
import { categoryLabel } from '@fp/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';

export type Rule = Output<'finance', 'listRules'>[number];
export type BudgetStatus = Output<'finance', 'listBudgets'>[number];
export type CategoryKind = Category['kind'];

export function useAccounts(includeArchived = false) {
  const { householdId } = useHousehold();
  return useQuery(
    apiQuery(api, 'finance', 'listAccounts', {
      params: { householdId },
      query: { includeArchived: includeArchived ? 'true' : 'false' },
    }),
  );
}

export function useCategories() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'finance', 'listCategories', { params: { householdId } }));
}

export function useInvalidateFinance(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: ['finance'] }), [queryClient]);
}

/** Translated label for a category; system categories by key, custom ones by name. */
export function useCategoryLabel(): (category: Category | null | undefined) => string {
  const locale = useLocale();
  const t = useTranslations('finance.transactions');
  return useCallback((c) => (c ? categoryLabel(locale, c) : t('uncategorized')), [locale, t]);
}

export interface CategoryOption {
  id: string;
  label: string;
  depth: number;
  kind: CategoryKind;
  category: Category;
}

/** Depth-first ordered categories (parents before children), sorted by label. */
export function useCategoryOptions(
  options: { kind?: CategoryKind; includeHidden?: boolean } = {},
): {
  options: CategoryOption[];
  byId: Map<string, Category>;
  isPending: boolean;
} {
  const query = useCategories();
  const label = useCategoryLabel();
  const { kind, includeHidden = false } = options;
  return useMemo(() => {
    const all = query.data ?? [];
    const byId = new Map(all.map((c) => [c.id, c]));
    const visible = all.filter((c) => (includeHidden || !c.hidden) && (!kind || c.kind === kind));
    const children = new Map<string | null, Category[]>();
    for (const c of visible) {
      const parent = c.parentId && visible.some((p) => p.id === c.parentId) ? c.parentId : null;
      const list = children.get(parent) ?? [];
      list.push(c);
      children.set(parent, list);
    }
    const out: CategoryOption[] = [];
    const walk = (parent: string | null, depth: number) => {
      const list = (children.get(parent) ?? [])
        .slice()
        .sort((a, b) => label(a).localeCompare(label(b)));
      for (const c of list) {
        out.push({ id: c.id, label: label(c), depth, kind: c.kind, category: c });
        walk(c.id, depth + 1);
      }
    };
    walk(null, 0);
    return { options: out, byId, isPending: query.isPending };
  }, [query.data, query.isPending, label, kind, includeHidden]);
}

export function accountById(
  accounts: Account[] | undefined,
  id: string | null | undefined,
): Account | undefined {
  return id ? accounts?.find((a) => a.id === id) : undefined;
}

/** Indentation prefix for options inside native selects (which ignore padding). */
export function indent(depth: number): string {
  return String.fromCharCode(0xa0).repeat(depth * 3);
}

export function todayLocalDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
