import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
  TextField,
} from '@/components/ui';
import { useMemberMap } from '@/features/household/household';
import {
  parsePointsDelta,
  useBalances,
  useIsParent,
  usePointsLedger,
  useRewardMutations,
} from '@/features/rewards/hooks';
import { useIntlLocale } from '@/i18n';

/** Points history of one member; parents can award or deduct points. */
export default function MemberPointsScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const parent = useIsParent();
  const member = useMemberMap().get(memberId);
  const balance = useBalances().data?.find((b) => b.memberId === memberId);
  const ledger = usePointsLedger(memberId);
  const { adjustPoints } = useRewardMutations();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ delta?: string; reason?: string }>({});
  const entries = ledger.data?.pages.flatMap((p) => p.items) ?? [];
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const submit = () => {
    const n = parsePointsDelta(delta);
    const next: typeof errors = {};
    if (n === null) next.delta = t('m.rewards.invalidDelta');
    if (!reason.trim()) next.reason = t('m.rewards.reasonRequired');
    setErrors(next);
    if (n === null || next.reason) return;
    adjustPoints.mutate(
      { memberId, delta: n, reason: reason.trim() },
      {
        onSuccess: () => {
          setDelta('');
          setReason('');
        },
      },
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={ledger.isRefetching} onRefresh={() => void ledger.refetch()} />
      }
    >
      <Stack.Screen options={{ title: member?.displayName ?? '' }} />
      <Card>
        <Text variant="caption">{t('m.rewards.available')}</Text>
        <Text variant="title">{balance?.available ?? 0}</Text>
        {balance && balance.reserved > 0 ? (
          <Text variant="caption">
            {t('m.rewards.reserved')}: {balance.reserved}
          </Text>
        ) : null}
      </Card>
      {parent ? (
        <Card>
          <Text variant="subheading">{t('m.rewards.adjust')}</Text>
          <TextField
            label={t('m.rewards.delta')}
            value={delta}
            onChangeText={setDelta}
            keyboardType="numbers-and-punctuation"
            maxLength={6}
            error={errors.delta}
          />
          <TextField
            label={t('m.rewards.reason')}
            placeholder={t('m.rewards.reasonPlaceholder')}
            value={reason}
            onChangeText={setReason}
            maxLength={200}
            error={errors.reason}
          />
          <Button title={t('m.rewards.book')} loading={adjustPoints.isPending} onPress={submit} />
        </Card>
      ) : null}
      <SectionHeader title={t('m.rewards.history')} />
      {ledger.isPending ? (
        <LoadingView />
      ) : entries.length === 0 ? (
        <EmptyState title={t('m.rewards.noHistory')} />
      ) : (
        <RowGroup>
          {entries.map((e, i) => (
            <View key={e.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={e.reason}
                subtitle={fmt.format(new Date(e.createdAt))}
                right={
                  <Text className={`font-semibold ${e.delta > 0 ? 'text-success' : 'text-danger'}`}>
                    {e.delta > 0 ? `+${String(e.delta)}` : String(e.delta)}
                  </Text>
                }
              />
            </View>
          ))}
        </RowGroup>
      )}
      {ledger.hasNextPage ? (
        <Button
          variant="secondary"
          title={t('m.rewards.loadMore')}
          loading={ledger.isFetchingNextPage}
          onPress={() => void ledger.fetchNextPage()}
        />
      ) : null}
    </ScrollView>
  );
}
