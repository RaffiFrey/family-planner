'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';

/**
 * Cursor pagination state: a stack of cursors for the pages visited so far,
 * so "previous" works even though the API only returns `nextCursor`.
 */
export function useCursorPager(resetKey: unknown = null) {
  const [state, setState] = React.useState<{ key: unknown; stack: (string | undefined)[] }>({
    key: resetKey,
    stack: [undefined],
  });
  // A changed filter/search key implicitly restarts at the first page.
  const current = (s: typeof state) => (Object.is(s.key, resetKey) ? s.stack : [undefined]);
  const stack = current(state);
  return {
    cursor: stack[stack.length - 1],
    page: stack.length,
    hasPrev: stack.length > 1,
    next: (nextCursor: string) => {
      setState((s) => ({ key: resetKey, stack: [...current(s), nextCursor] }));
    },
    prev: () => {
      setState((s) => {
        const st = current(s);
        return { key: resetKey, stack: st.length > 1 ? st.slice(0, -1) : st };
      });
    },
  };
}

export function CursorPager({
  pager,
  nextCursor,
  isFetching,
}: {
  pager: ReturnType<typeof useCursorPager>;
  nextCursor: string | null | undefined;
  isFetching?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2 text-xs text-muted">
      <span>
        Page {pager.page}
        {isFetching ? ' - loading...' : ''}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={pager.prev}
        disabled={!pager.hasPrev || isFetching}
        aria-label="Previous page"
      >
        <ChevronLeftIcon />
        Prev
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (nextCursor) pager.next(nextCursor);
        }}
        disabled={!nextCursor || isFetching}
        aria-label="Next page"
      >
        Next
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

/** Debounced value for search inputs. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => {
      setV(value);
    }, ms);
    return () => {
      clearTimeout(t);
    };
  }, [value, ms]);
  return v;
}
