'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type EditScope = 'this' | 'following' | 'all';
const SCOPES: EditScope[] = ['this', 'following', 'all'];

interface ScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'edit' | 'delete';
  loading?: boolean;
  onConfirm: (scope: EditScope) => void;
}

/** Asks which occurrences of a recurring event a change or deletion applies to. */
export function ScopeDialog({
  open,
  onOpenChange,
  kind,
  loading = false,
  onConfirm,
}: ScopeDialogProps) {
  const t = useTranslations('calendar.scope');
  const tr = useTranslations('recurrence.editScope');
  const tc = useTranslations('common');
  const [scope, setScope] = React.useState<EditScope>('this');
  const id = React.useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{kind === 'edit' ? t('editTitle') : t('deleteTitle')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="sr-only">{t('description')}</legend>
          {SCOPES.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name={`${id}-scope`}
                value={s}
                checked={scope === s}
                onChange={() => setScope(s)}
                className="accent-(--fp-primary)"
              />
              {tr(s)}
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button
            variant={kind === 'delete' ? 'destructive' : 'default'}
            loading={loading}
            onClick={() => onConfirm(scope)}
          >
            {kind === 'delete' ? tc('delete') : tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
