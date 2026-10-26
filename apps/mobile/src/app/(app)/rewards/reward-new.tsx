import type { Reward } from '@fp/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, LoadingView, RowGroup, ScreenScroll, SwitchRow, TextField } from '@/components/ui';
import { useCatalog, useRewardMutations } from '@/features/rewards/hooks';
import { confirmAsync } from '@/lib/dialogs';

/** Create a reward, or edit one when `rewardId` is given (title, cost, active toggle, delete). */
export default function RewardFormScreen() {
  const { rewardId } = useLocalSearchParams<{ rewardId?: string }>();
  const catalog = useCatalog();
  if (rewardId && catalog.isPending) return <LoadingView />;
  const reward = rewardId ? (catalog.data?.find((r) => r.id === rewardId) ?? null) : null;
  return <RewardForm key={reward?.id ?? 'new'} reward={reward} />;
}

function RewardForm({ reward }: { reward: Reward | null }) {
  const { t } = useTranslation();
  const { createReward, updateReward, removeReward } = useRewardMutations();
  const [title, setTitle] = useState(reward?.title ?? '');
  const [description, setDescription] = useState(reward?.description ?? '');
  const [cost, setCost] = useState(reward ? String(reward.costPoints) : '');
  const [active, setActive] = useState(reward?.active ?? true);
  const [costError, setCostError] = useState<string | undefined>();
  const pending = createReward.isPending || updateReward.isPending;

  const submit = () => {
    const n = Number(cost.trim());
    if (!Number.isInteger(n) || n < 1 || n > 100_000) {
      setCostError(t('m.rewards.invalidCost'));
      return;
    }
    setCostError(undefined);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      costPoints: n,
      active,
    };
    const done = {
      onSuccess: () => {
        router.back();
      },
    };
    if (reward) updateReward.mutate({ reward, body }, done);
    else createReward.mutate(body, done);
  };

  const remove = async () => {
    if (!reward) return;
    const ok = await confirmAsync(t('m.rewards.deleteReward'), reward.title, {
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok)
      removeReward.mutate(reward, {
        onSuccess: () => {
          router.back();
        },
      });
  };

  return (
    <ScreenScroll>
      <Stack.Screen
        options={{ title: reward ? t('m.rewards.editReward') : t('m.rewards.newReward') }}
      />
      <TextField
        label={t('m.rewards.rewardTitle')}
        placeholder={t('m.rewards.rewardTitlePlaceholder')}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        autoFocus={!reward}
      />
      <TextField
        label={`${t('m.rewards.description')} (${t('common.optional')})`}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1000}
      />
      <TextField
        label={t('m.rewards.cost')}
        value={cost}
        onChangeText={setCost}
        keyboardType="number-pad"
        maxLength={6}
        error={costError}
      />
      <RowGroup>
        <SwitchRow
          title={t('m.rewards.active')}
          subtitle={t('m.rewards.activeHint')}
          value={active}
          onValueChange={setActive}
        />
      </RowGroup>
      <Button
        title={t('common.save')}
        disabled={title.trim() === '' || cost.trim() === ''}
        loading={pending}
        onPress={submit}
      />
      {reward ? (
        <Button
          variant="ghost"
          title={t('common.delete')}
          loading={removeReward.isPending}
          onPress={() => void remove()}
        />
      ) : null}
    </ScreenScroll>
  );
}
