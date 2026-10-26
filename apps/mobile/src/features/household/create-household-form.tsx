import { MEMBER_COLORS } from '@fp/ui-tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, ChipSelect, Text, TextField } from '@/components/ui';
import { useSettings } from '@/features/settings/settings-store';
import { useLocale } from '@/i18n';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { meQuery } from './household';

/** Creates a household with the current user as owner and switches to it. */
export function CreateHouseholdForm({
  defaultName,
  onCreated,
}: {
  defaultName: string;
  onCreated?: () => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const setActive = useSettings((s) => s.setActiveHouseholdId);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState(defaultName);
  const [color, setColor] = useState<string>(MEMBER_COLORS[5]);
  const create = useMutation({
    mutationFn: () =>
      api.households.create({
        body: {
          name: name.trim(),
          displayName: displayName.trim(),
          color,
          locale,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin',
        },
      }),
    onSuccess: async (detail) => {
      setActive(detail.household.id);
      await queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
      onCreated?.();
    },
  });
  const valid = name.trim().length > 0 && displayName.trim().length > 0;
  return (
    <View className="gap-4">
      <TextField
        label={t('m.onboarding.householdName')}
        placeholder={t('m.onboarding.householdNamePlaceholder')}
        value={name}
        onChangeText={setName}
      />
      <TextField
        label={t('m.onboarding.yourName')}
        value={displayName}
        onChangeText={setDisplayName}
      />
      <ChipSelect
        label={t('m.family.color')}
        options={MEMBER_COLORS.map((c, i) => ({ value: c, label: String(i + 1), color: c }))}
        value={color}
        onChange={setColor}
        scroll
      />
      {create.error ? <Text className="text-danger">{errorMessage(create.error, t)}</Text> : null}
      <Button
        title={t('m.onboarding.create')}
        disabled={!valid}
        loading={create.isPending}
        onPress={() => {
          create.mutate();
        }}
      />
    </View>
  );
}
