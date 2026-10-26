import type { Redemption, Reward } from '@fp/contracts';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Coins, Gift, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { FeatureGate, ModuleGate } from '@/components/gates';
import {
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingView,
  ProgressBar,
  IconButton,
  Segmented,
  RowGroup,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useHousehold, useMemberMap, useMembers } from '@/features/household/household';
import {
  type LeaderboardPeriod,
  useFreshMembers,
  useAllowanceBalances,
  useBalances,
  useCatalog,
  useIsParent,
  useLeaderboard,
  useRedemptions,
  useRewardMutations,
} from '@/features/rewards/hooks';
import { useMoney } from '@/features/finance/hooks';
import type { CurrencyCode } from '@fp/domain/money';
import { confirmAsync, notify } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';
import { useNow } from '@/lib/use-now';
import { parseDayKey } from '@/features/calendar/dates';
import { isCurrentPeriod, periodAt, periodLabel, shiftPeriod } from '@/features/rewards/period';
import { useIntlLocale } from '@/i18n';

export default function RewardsScreen() {
  return (
    <ModuleGate action="rewards.read">
      <FeatureGate feature="rewards">
        <RewardsContent />
      </FeatureGate>
    </ModuleGate>
  );
}

function RewardsContent() {
  const parent = useIsParent();
  const balances = useBalances();
  const catalog = useCatalog();
  const redemptions = useRedemptions();
  const household = useFreshMembers();
  const refreshing = balances.isRefetching || catalog.isRefetching || redemptions.isRefetching;
  const refresh = () => {
    void balances.refetch();
    void catalog.refetch();
    void redemptions.refetch();
    void household.refetch();
  };
  if (balances.isPending || catalog.isPending) return <LoadingView />;
  const error = balances.error ?? catalog.error;
  if (error && (!balances.data || !catalog.data))
    return <ErrorState error={error} onRetry={refresh} />;
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {parent ? <ParentView /> : <ChildView />}
    </ScrollView>
  );
}

function StatusBadge({ status }: { status: Redemption['status'] }) {
  const { t } = useTranslation();
  const tone =
    status === 'approved'
      ? 'bg-success'
      : status === 'rejected'
        ? 'bg-danger'
        : status === 'requested'
          ? 'bg-warning'
          : 'bg-surface-muted';
  return (
    <View className={`rounded-full px-2 py-0.5 ${tone}`}>
      <Text
        className={`text-xs font-semibold ${status === 'cancelled' ? 'text-muted' : 'text-white'}`}
      >
        {t(`m.rewards.status.${status}`)}
      </Text>
    </View>
  );
}

// ---------- child / teen

function ChildView() {
  const { t } = useTranslation();
  const colors = useColors();
  const { me, can } = useHousehold();
  const balances = useBalances();
  const catalog = useCatalog();
  const redemptions = useRedemptions();
  const { redeem, cancel } = useRewardMutations();
  const fmtMoney = useMoney();
  const allowance = useAllowanceBalances().data?.find((b) => b.memberId === me.id);
  const mine = balances.data?.find((b) => b.memberId === me.id);
  const available = mine?.available ?? 0;
  const rewards = (catalog.data ?? []).filter((r) => r.active);
  const myRequests = (redemptions.data ?? []).filter((r) => r.memberId === me.id).slice(0, 10);

  const request = async (reward: Reward) => {
    const ok = await confirmAsync(
      t('m.rewards.requestTitle', { title: reward.title }),
      t('m.rewards.requestMessage', { points: reward.costPoints }),
      { confirmLabel: t('m.rewards.request'), cancelLabel: t('common.cancel') },
    );
    if (!ok) return;
    redeem.mutate(reward, {
      onSuccess: () => {
        notify(t('m.rewards.requested'));
      },
    });
  };

  return (
    <>
      <Card>
        <Text variant="caption">{t('m.rewards.myPoints')}</Text>
        <View className="flex-row items-center gap-2">
          <Coins size={28} color={colors.warning} />
          <Text variant="title">{available}</Text>
        </View>
        {mine && mine.reserved > 0 ? (
          <Text variant="caption">
            {t('m.rewards.reserved')}: {t('m.rewards.points', { count: mine.reserved })}
          </Text>
        ) : null}
      </Card>

      {allowance ? (
        <RowGroup>
          <ListRow
            title={t('m.rewards.allowance')}
            left={<Coins size={22} color={colors.primary} />}
            right={
              <Text className="font-semibold">
                {fmtMoney(allowance.balanceMinor, allowance.currency as CurrencyCode)}
              </Text>
            }
            chevron
            onPress={() => {
              router.push('/rewards/allowance');
            }}
          />
        </RowGroup>
      ) : null}

      <SectionHeader title={t('m.rewards.catalog')} />
      {rewards.length === 0 ? (
        <EmptyState title={t('m.rewards.noRewards')} message={t('m.rewards.noRewardsHint')} />
      ) : (
        rewards.map((r) => {
          const missing = r.costPoints - available;
          return (
            <Card key={r.id}>
              <View className="flex-row items-center gap-3">
                <Gift size={24} color={colors.primary} />
                <View className="flex-1">
                  <Text variant="subheading">{r.title}</Text>
                  {r.description ? <Text variant="caption">{r.description}</Text> : null}
                </View>
                <Text className="font-semibold">
                  {t('m.rewards.points', { count: r.costPoints })}
                </Text>
              </View>
              <ProgressBar
                ratio={available / r.costPoints}
                tone={missing > 0 ? 'primary' : 'success'}
                label={t('m.rewards.points', { count: available })}
              />
              {missing > 0 ? (
                <Text variant="caption">{t('m.rewards.notEnough', { missing })}</Text>
              ) : can('rewards.write') ? (
                <Button
                  size="sm"
                  title={t('m.rewards.request')}
                  loading={redeem.isPending && redeem.variables.id === r.id}
                  onPress={() => void request(r)}
                />
              ) : null}
            </Card>
          );
        })
      )}

      {myRequests.length > 0 ? (
        <>
          <SectionHeader title={t('m.rewards.myRequests')} />
          <RowGroup>
            {myRequests.map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={r.rewardTitle}
                  subtitle={t('m.rewards.points', { count: r.costPoints })}
                  right={
                    <View className="items-end gap-1">
                      <StatusBadge status={r.status} />
                      {r.status === 'requested' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t('m.rewards.cancelRequest')}
                          onPress={() => {
                            cancel.mutate(r);
                          }}
                        />
                      ) : null}
                    </View>
                  }
                />
              </View>
            ))}
          </RowGroup>
        </>
      ) : null}
    </>
  );
}

// ---------- parents

function ParentView() {
  const { t } = useTranslation();
  const colors = useColors();
  const members = useMemberMap();
  const allMembers = useMembers();
  const balances = useBalances();
  const catalog = useCatalog();
  const open = useRedemptions('requested');
  const intlLocale = useIntlLocale();
  const now = useNow();
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const leaderboard = useLeaderboard(period, periodAt(anchor));
  const atCurrent = isCurrentPeriod(anchor, period, now);
  const range = leaderboard.data
    ? periodLabel(
        period,
        parseDayKey(leaderboard.data.from),
        parseDayKey(leaderboard.data.to),
        intlLocale,
        t('m.rewards.weekPrefix'),
      )
    : '';
  const { approve, reject, removeReward } = useRewardMutations();
  // Every member is listed (0 points until the first booking), so parents can award first points.
  const balanceById = new Map((balances.data ?? []).map((b) => [b.memberId, b]));
  const memberBalances = allMembers
    .filter((m) => m.role !== 'caregiver')
    .map((member) => ({
      member,
      b: balanceById.get(member.id) ?? {
        memberId: member.id,
        points: 0,
        reserved: 0,
        available: 0,
      },
    }));
  const weekPoints = new Map((leaderboard.data?.rows ?? []).map((r) => [r.memberId, r.points]));

  return (
    <>
      <SectionHeader title={t('m.rewards.openRequests')} />
      {(open.data ?? []).length === 0 ? (
        <Text variant="caption">{t('m.rewards.noOpenRequests')}</Text>
      ) : (
        (open.data ?? []).map((r) => {
          const member = members.get(r.memberId);
          const name = member?.displayName ?? '';
          return (
            <Card key={r.id}>
              <View className="flex-row items-center gap-3">
                <Avatar name={name || '?'} color={member?.color ?? colors.textMuted} size={32} />
                <View className="flex-1">
                  <Text className="font-semibold">{r.rewardTitle}</Text>
                  <Text variant="caption">
                    {name} · {t('m.rewards.points', { count: r.costPoints })}
                  </Text>
                </View>
              </View>
              {r.note ? <Text variant="caption">{r.note}</Text> : null}
              <View className="flex-row gap-2">
                <Button
                  className="flex-1"
                  size="sm"
                  title={t('m.rewards.approve')}
                  accessibilityLabel={t('m.rewards.approveLabel', {
                    reward: r.rewardTitle,
                    member: name,
                  })}
                  onPress={() => {
                    approve.mutate(r);
                  }}
                />
                <Button
                  className="flex-1"
                  size="sm"
                  variant="secondary"
                  title={t('m.rewards.reject')}
                  accessibilityLabel={t('m.rewards.rejectLabel', {
                    reward: r.rewardTitle,
                    member: name,
                  })}
                  onPress={() => {
                    reject.mutate(r);
                  }}
                />
              </View>
            </Card>
          );
        })
      )}

      <SectionHeader title={t('m.rewards.balances')} />
      <Segmented<LeaderboardPeriod>
        label={t('m.rewards.period')}
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setAnchor(new Date());
        }}
        options={[
          { value: 'week', label: t('m.rewards.periodWeek') },
          { value: 'month', label: t('m.rewards.periodMonth') },
        ]}
      />
      <View className="flex-row items-center justify-between">
        <IconButton
          label={t('m.rewards.previousPeriod')}
          onPress={() => {
            setAnchor((a) => shiftPeriod(a, period, -1));
          }}
        >
          <ChevronLeft size={22} color={colors.text} />
        </IconButton>
        <Text
          variant="subheading"
          className="flex-1 text-center"
          accessibilityLiveRegion="polite"
          testID="leaderboard-period"
        >
          {range}
        </Text>
        <IconButton
          label={t('m.rewards.nextPeriod')}
          disabled={atCurrent}
          className={atCurrent ? 'opacity-30' : ''}
          onPress={() => {
            setAnchor((a) => shiftPeriod(a, period, 1));
          }}
        >
          <ChevronRight size={22} color={colors.text} />
        </IconButton>
      </View>
      <RowGroup>
        {memberBalances.map(({ member, b }, i) => {
          const week = weekPoints.get(b.memberId) ?? 0;
          return (
            <View key={b.memberId}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={member.displayName}
                subtitle={[
                  `${t('m.rewards.available')}: ${String(b.available)}`,
                  b.reserved > 0 ? `${t('m.rewards.reserved')}: ${String(b.reserved)}` : null,
                  week > 0 ? `${t('m.rewards.inPeriod')}: +${String(week)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                left={<Avatar name={member.displayName} color={member.color} size={32} />}
                right={<Text className="font-semibold">{b.points}</Text>}
                chevron
                onPress={() => {
                  router.push({
                    pathname: '/rewards/member/[memberId]',
                    params: { memberId: b.memberId },
                  });
                }}
              />
            </View>
          );
        })}
      </RowGroup>

      <SectionHeader
        title={t('m.rewards.catalog')}
        action={
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus size={18} color={colors.primary} />}
            title={t('m.rewards.newReward')}
            onPress={() => {
              router.push('/rewards/reward-new');
            }}
          />
        }
      />
      {(catalog.data ?? []).length === 0 ? (
        <EmptyState title={t('m.rewards.noRewards')} message={t('m.rewards.noRewardsHint')} />
      ) : (
        <RowGroup>
          {(catalog.data ?? []).map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={r.title}
                subtitle={[
                  t('m.rewards.points', { count: r.costPoints }),
                  r.active ? null : t('m.rewards.inactive'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                left={<Gift size={22} color={colors.primary} />}
                accessibilityHint={t('m.rewards.manageHint')}
                chevron
                onPress={() => {
                  router.push({ pathname: '/rewards/reward-new', params: { rewardId: r.id } });
                }}
                onLongPress={() => {
                  void confirmAsync(t('m.rewards.deleteReward'), r.title, {
                    confirmLabel: t('common.delete'),
                    cancelLabel: t('common.cancel'),
                    destructive: true,
                  }).then((ok) => {
                    if (ok) removeReward.mutate(r);
                  });
                }}
              />
            </View>
          ))}
        </RowGroup>
      )}

      <RowGroup>
        <ListRow
          title={t('m.rewards.allowance')}
          left={<Coins size={22} color={colors.primary} />}
          chevron
          onPress={() => {
            router.push('/rewards/allowance');
          }}
        />
      </RowGroup>
    </>
  );
}
