'use client';

import { apiQuery } from '@fp/api-client';
import type { Suggestion } from '@fp/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type SuggestionT = z.infer<typeof Suggestion>;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Text + quantity input with history suggestions (ARIA 1.2 combobox pattern). */
export function QuickAdd({
  onAdd,
  disabled = false,
}: {
  onAdd: (item: {
    text: string;
    quantity: string | null;
    category?: SuggestionT['category'];
  }) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('lists');
  const tcat = useTranslations('itemCategories');
  const { householdId } = useHousehold();
  const id = React.useId();
  const listboxId = `${id}-listbox`;
  const [text, setText] = React.useState('');
  const [quantity, setQuantity] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const q = useDebounced(text.trim(), 200);

  const suggestionsQuery = useQuery({
    ...apiQuery(api, 'lists', 'suggestions', { params: { householdId }, query: { q } }),
    enabled: open && q.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const suggestions = open && q.length > 0 ? (suggestionsQuery.data ?? []).slice(0, 8) : [];
  const expanded = suggestions.length > 0;

  const submit = (s?: SuggestionT) => {
    const value = (s?.text ?? text).trim();
    if (!value) return;
    onAdd({
      text: value,
      quantity: quantity.trim() || null,
      ...(s ? { category: s.category } : {}),
    });
    setText('');
    setQuantity('');
    setActive(-1);
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (expanded) setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (expanded) setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit(expanded && active >= 0 ? suggestions[active] : undefined);
    }
  };

  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="relative min-w-48 flex-1">
        <label htmlFor={`${id}-text`} className="sr-only">
          {t('addItem')}
        </label>
        <Input
          ref={inputRef}
          id={`${id}-text`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-activedescendant={expanded && active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          placeholder={t('addItemPlaceholder')}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
        />
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t('suggestions')}
          className={cn(
            'absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-background p-1 shadow-md',
            !expanded && 'hidden',
          )}
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.text}-${s.category}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                submit(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm',
                i === active && 'bg-surface-muted',
              )}
            >
              <span className="truncate">{s.text}</span>
              <span className="shrink-0 text-xs text-muted">{tcat(s.category)}</span>
            </li>
          ))}
        </ul>
      </div>
      <label htmlFor={`${id}-qty`} className="sr-only">
        {t('quantity')}
      </label>
      <Input
        id={`${id}-qty`}
        className="w-24"
        placeholder={t('quantityPlaceholder')}
        value={quantity}
        maxLength={40}
        disabled={disabled}
        onChange={(e) => setQuantity(e.target.value)}
      />
      <Button type="submit" disabled={disabled || text.trim() === ''}>
        <Plus aria-hidden />
        <span className="sr-only sm:not-sr-only">{t('add')}</span>
      </Button>
    </form>
  );
}
