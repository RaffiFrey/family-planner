import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ChipSelect, ScreenScroll, Text, TextField } from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

const KINDS = ['shopping', 'todo', 'packing', 'wishlist', 'other'] as const;
type Kind = (typeof KINDS)[number];

export default function NewListScreen() {
  const { t } = useTranslation();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('shopping');
  const [visibility, setVisibility] = useState<'household' | 'private'>('household');
  const create = useMutation({
    mutationFn: () =>
      api.lists.create({ params: { householdId }, body: { name: name.trim(), kind, visibility } }),
    onSuccess: async (list) => {
      await queryClient.invalidateQueries({ queryKey: ['lists'] });
      router.replace({ pathname: '/lists/[listId]', params: { listId: list.id } });
    },
  });
  return (
    <ScreenScroll>
      <TextField
        label={t('common.name')}
        value={name}
        onChangeText={setName}
        autoFocus
        placeholder={t('m.lists.namePlaceholder')}
      />
      <ChipSelect
        label={t('m.lists.kind')}
        options={KINDS.map((k) => ({ value: k, label: t(`listKinds.${k}`) }))}
        value={kind}
        onChange={setKind}
      />
      <ChipSelect
        label={t('m.common.visibility')}
        options={(['household', 'private'] as const).map((v) => ({
          value: v,
          label: t(`visibility.${v}`),
        }))}
        value={visibility}
        onChange={setVisibility}
      />
      {create.error ? <Text className="text-danger">{errorMessage(create.error, t)}</Text> : null}
      <Button
        title={t('common.create')}
        disabled={name.trim() === ''}
        loading={create.isPending}
        onPress={() => {
          create.mutate();
        }}
      />
    </ScreenScroll>
  );
}
