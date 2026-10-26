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
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface NameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initialValue?: string;
  submitLabel: string;
  loading?: boolean;
  onSubmit: (name: string) => void;
}

/** Single text field dialog used for "new folder" and "rename". */
export function NameDialog({
  open,
  onOpenChange,
  title,
  label,
  initialValue = '',
  submitLabel,
  loading,
  onSubmit,
}: NameDialogProps) {
  const t = useTranslations('ui');
  const [value, setValue] = React.useState(initialValue);
  const [error, setError] = React.useState<string>();

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setValue(initialValue);
      setError(undefined);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const name = value.trim();
            if (!name) {
              setError(t('required'));
              return;
            }
            onSubmit(name);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{label}</DialogDescription>
          </DialogHeader>
          <Field label={label} error={error}>
            {(control) => (
              <Input
                {...control}
                autoFocus
                value={value}
                maxLength={255}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="submit" loading={loading}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
