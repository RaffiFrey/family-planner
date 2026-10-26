import type { CurrencyCode } from '@fp/domain/money';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  Avatar,
  Button,
  Card,
  ChipSelect,
  Divider,
  EmptyState,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
  TextField,
} from '@/components/ui';
import { amountInputToMinor } from '@/features/finance/amount-input';
import { useAmountFormat, useMoney } from '@/features/finance/hooks';
import { useMemberMap, useMembers } from '@/features/household/household';
import { ALLOWANCE_KINDS, type AllowanceKind } from '@/features/rewards/allowance';
import {
  useAllowanceBalances,
  useAllowanceLedger,
  useAllowanceRules,
  useIsParent,
  useRewardMutations,
} from '@/features/rewards/hooks';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';

/** Pocket money: balances, rules, ledger and (for parents) quick booking. */
export default function AllowanceScreen() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmtMoney = useMoney();
  const amountFormat = useAmountFormat();
  const parent = useIsParent();
  const colors = useColors();
  const members = useMemberMap();
  const kids = useMembers().filter((m) => m.role === 'child' || m.role === 'teen');
  const balances = useAllowanceBalances();
  const rules = useAllowanceRules();
  const [filter, setFilter] = useState<string>('all');
  const ledger = useAllowanceLedger(filter === 'all' ? null : filter);
  const { addAllowanceEntry } = useRewardMutations();

  const [memberId, setMemberId] = useState<string | null>(kids[0]?.id ?? null);
  const [kind, setKind] = useState<AllowanceKind>('payout');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const entries = ledger.data?.pages.flatMap((p) => p.items) ?? [];
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  const book = () => {
    if (!memberId) {
      setError(t('m.rewards.chooseMember'));
      return;
    }
    const minor = amountInputToMinor(amount.trim().replace(/^-/, ''), 'income', amountFormat);
    if (minor === null) {
      setError(t('m.rewards.invalidAmount'));
      return;
    }
    setError(null);
    const negativeCorrection = kind === 'correction' && amount.trim().startsWith('-');
    addAllowanceEntry.mutate(
      {
        memberId,
        kind,
        amountMinor: negativeCorrection ? -minor : minor,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          setAmount('');
          setNote('');
        },
      },
    );
  };

  const refresh = () => {
    void balances.refetch();
    void rules.refetch();
    void ledger.refetch();
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={balances.isRefetching || ledger.isRefetching}
          onRefresh={refresh}
        />
      }
    >
      <SectionHeader title={t('m.rewards.allowanceBalances')} />
      {balances.isPending ? (
        <LoadingView />
      ) : (balances.data ?? []).length === 0 ? (
        <Text variant="caption">{t('m.rewards.noAllowance')}</Text>
      ) : (
        <RowGroup>
          {(balances.data ?? []).map((b, i) => {
            const m = members.get(b.memberId);
            const memberRules = (rules.data ?? []).filter(
              (r) => r.memberId === b.memberId && r.active,
            );
            return (
              <View key={b.memberId}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={m?.displayName ?? ''}
                  subtitle={memberRules
                    .map((r) =>
                      [
                        t(
                          r.interval === 'weekly'
                            ? 'm.rewards.ruleWeekly'
                            : 'm.rewards.ruleMonthly',
                          {
                            amount: fmtMoney(r.amountMinor, r.currency as CurrencyCode),
                          },
                        ),
                        r.nextPayday
                          ? t('m.rewards.nextPayday', {
                              date: dateFmt.format(new Date(`${r.nextPayday}T12:00:00`)),
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                    )
                    .join('\n')}
                  left={m ? <Avatar name={m.displayName} color={m.color} size={32} /> : null}
                  right={
                    <Text className="font-semibold">
                      {fmtMoney(b.balanceMinor, b.currency as CurrencyCode)}
                    </Text>
                  }
                />
              </View>
            );
          })}
        </RowGroup>
      )}

      {parent ? (
        <>
          <SectionHeader
            title={t('m.rewards.rules')}
            action={
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus size={18} color={colors.primary} />}
                title={t('m.rewards.newRule')}
                onPress={() => {
                  router.push('/rewards/allowance-rule');
                }}
              />
            }
          />
          {(rules.data ?? []).length === 0 ? (
            <Text variant="caption">{t('m.rewards.noRules')}</Text>
          ) : (
            <RowGroup>
              {(rules.data ?? []).map((r, i) => (
                <View key={r.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={members.get(r.memberId)?.displayName ?? ''}
                    subtitle={[
                      t(
                        r.interval === 'weekly' ? 'm.rewards.ruleWeekly' : 'm.rewards.ruleMonthly',
                        {
                          amount: fmtMoney(r.amountMinor, r.currency as CurrencyCode),
                        },
                      ),
                      r.active ? null : t('m.rewards.inactive'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    chevron
                    onPress={() => {
                      router.push({
                        pathname: '/rewards/allowance-rule',
                        params: { ruleId: r.id },
                      });
                    }}
                  />
                </View>
              ))}
            </RowGroup>
          )}
        </>
      ) : null}

      {parent && kids.length > 0 ? (
        <Card>
          <Text variant="subheading">{t('m.rewards.newEntry')}</Text>
          <ChipSelect
            label={t('m.rewards.member')}
            value={memberId}
            onChange={setMemberId}
            options={kids.map((k) => ({ value: k.id, label: k.displayName, color: k.color }))}
          />
          <ChipSelect<AllowanceKind>
            label={t('m.rewards.kind')}
            value={kind}
            onChange={setKind}
            options={ALLOWANCE_KINDS.map((k) => ({ value: k, label: t(`m.rewards.kinds.${k}`) }))}
          />
          <TextField
            label={t('m.rewards.amount')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={amountFormat.style === 'de' ? '5,00' : '5.00'}
            maxLength={12}
          />
          <TextField
            label={`${t('m.rewards.note')} (${t('common.optional')})`}
            value={note}
            onChangeText={setNote}
            maxLength={500}
          />
          {error ? (
            <Text className="text-danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button
            title={t('m.rewards.book')}
            disabled={amount.trim() === ''}
            loading={addAllowanceEntry.isPending}
            onPress={book}
          />
        </Card>
      ) : null}

      <SectionHeader title={t('m.rewards.ledger')} />
      {parent && kids.length > 1 ? (
        <ChipSelect
          scroll
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('common.all') },
            ...kids.map((k) => ({ value: k.id, label: k.displayName, color: k.color })),
          ]}
        />
      ) : null}
      {ledger.isPending ? (
        <LoadingView />
      ) : entries.length === 0 ? (
        <EmptyState title={t('m.rewards.noAllowance')} />
      ) : (
        <RowGroup>
          {entries.map((e, i) => {
            const signed = e.amountMinor;
            return (
              <View key={e.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={e.note ?? t(`m.rewards.kinds.${e.kind}`)}
                  subtitle={[
                    members.get(e.memberId)?.displayName,
                    t(`m.rewards.kinds.${e.kind}`),
                    dateFmt.format(new Date(`${e.date}T12:00:00`)),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={
                    <Text
                      className={`font-semibold ${signed >= 0 ? 'text-success' : 'text-danger'}`}
                    >
                      {fmtMoney(signed, e.currency as CurrencyCode)}
                    </Text>
                  }
                />
              </View>
            );
          })}
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
