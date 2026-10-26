'use client';

import { ITEM_CATEGORIES, type ListItem } from '@fp/contracts';
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
import { Input, NativeSelect } from '@/components/ui/input';

type Category = ListItem['category'];
type Patch = { text: string; quantity: string | null; category: Category };

export function ItemDialog({
  item,
  onOpenChange,
  onSave,
  onDelete,
}: {
  item: ListItem | null;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Patch) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('lists');
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editItem')}</DialogTitle>
          <DialogDescription className="sr-only">{item?.text}</DialogDescription>
        </DialogHeader>
        {item ? (
          <ItemForm
            key={item.id}
            item={item}
            onCancel={() => onOpenChange(false)}
            onSave={onSave}
            onDelete={onDelete}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  item,
  onCancel,
  onSave,
  onDelete,
}: {
  item: ListItem;
  onCancel: () => void;
  onSave: (patch: Patch) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('lists');
  const tc = useTranslations('common');
  const tcat = useTranslations('itemCategories');
  const [text, setText] = React.useState(item.text);
  const [quantity, setQuantity] = React.useState(item.quantity ?? '');
  const [category, setCategory] = React.useState<Category>(item.category);
  const trimmed = text.trim();

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        onSave({ text: trimmed, quantity: quantity.trim() || null, category });
      }}
    >
      <Field label={t('itemText')} error={trimmed ? undefined : t('nameRequired')}>
        {(p) => (
          <Input
            {...p}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('quantity')}>
          {(p) => (
            <Input
              {...p}
              value={quantity}
              maxLength={40}
              placeholder={t('quantityPlaceholder')}
              onChange={(e) => setQuantity(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('category')}>
          {(p) => (
            <NativeSelect
              {...p}
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {ITEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {tcat(c)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      <DialogFooter className="sm:justify-between">
        <Button variant="destructive" onClick={onDelete}>
          {tc('delete')}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button type="submit" disabled={!trimmed}>
            {tc('save')}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
