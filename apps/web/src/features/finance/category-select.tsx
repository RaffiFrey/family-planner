'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { NativeSelect } from '@/components/ui/input';
import { type CategoryKind, type CategoryOption, indent, useCategoryOptions } from './hooks';

const KINDS: CategoryKind[] = ['expense', 'income', 'transfer'];

type CategorySelectProps = Omit<React.ComponentProps<'select'>, 'children'> & {
  /** Restrict to one kind; otherwise options are grouped by kind. */
  kind?: CategoryKind;
  /** Label of the empty option; omit to hide it. */
  emptyLabel?: string;
  /** Always include this id even if hidden or of another kind (keeps the current value visible). */
  includeId?: string | null;
};

/** Native select with the category tree (keyboard and mobile friendly). */
export function CategorySelect({ kind, emptyLabel, includeId, ...props }: CategorySelectProps) {
  const t = useTranslations('finance.categories.kinds');
  const { options: all } = useCategoryOptions({ includeHidden: true });
  const options = all.filter(
    (o) => o.id === includeId || (!o.category.hidden && (!kind || o.kind === kind)),
  );
  const render = (list: CategoryOption[]) =>
    list.map((o) => (
      <option key={o.id} value={o.id}>
        {indent(o.depth) + o.label}
      </option>
    ));
  return (
    <NativeSelect {...props}>
      {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
      {kind
        ? render(options)
        : KINDS.map((k) => {
            const group = options.filter((o) => o.kind === k);
            return group.length ? (
              <optgroup key={k} label={t(k)}>
                {render(group)}
              </optgroup>
            ) : null;
          })}
    </NativeSelect>
  );
}
