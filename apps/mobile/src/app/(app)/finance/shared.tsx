import type { CurrencyCode } from '@fp/domain/money';
import { router } from 'expo-router';
import { ArrowRight, HandCoins, Receipt, Trash2, User, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Fab,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
  TextField,
} from '@/components/ui';
import { useMoney } from '@/features/finance/hooks';
import {
  useBalances,
  useFinancePlusMutation,
  useParties,
  useSettlements,
  useSettleUp,
  useSharedExpenses,
} from '@/features/finance-plus/hooks';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

/** Who owes whom, settle-up transfers, recent shared expenses and people. */
export default function SharedExpensesScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const fmt = useMoney();
  const { can } = useHousehold();
  const writable = can('finance.write');
  const parties = useParties();
  const balances = useBalances();
  const settle = useSettleUp();
  const expenses = useSharedExpenses();
  const settlements = useSettlements();
  const [personName, setPersonName] = useState('');

  const names = new Map((parties.data ?? []).map((p) => [p.id, p.name]));
  const nameOf = (id: string) => names.get(id) ?? '?';

  const settleMutation = useFinancePlusMutation(
    (
      householdId,
      s: { fromPartyId: string; toPartyId: string; amountMinor: number; currency: string },
    ) =>
      api.financePlus.createSettlement({
        params: { householdId },
        body: {
          fromPartyId: s.fromPartyId,
          toPartyId: s.toPartyId,
          amountMinor: s.amountMinor,
          currency: s.currency as CurrencyCode,
        },
      }),
  );
  const addPerson = useFinancePlusMutation(
    (householdId, name: string) =>
      api.financePlus.createParty({ params: { householdId }, body: { name } }),
    () => {
      setPersonName('');
    },
  );
  const removeSettlement = useFinancePlusMutation((householdId, settlementId: string) =>
    api.financePlus.deleteSettlement({ params: { householdId, settlementId } }),
  );

  const refresh = () => {
    void parties.refetch();
    void balances.refetch();
    void settle.refetch();
    void expenses.refetch();
    void settlements.refetch();
  };
  const loading = parties.isPending || balances.isPending;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const nonZero = (balances.data ?? []).flatMap((b) =>
    b.balances.filter((x) => x.balanceMinor !== 0).map((x) => ({ ...x, currency: b.currency })),
  );

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-28"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={expenses.isRefetching} onRefresh={refresh} />}
      >
        {loading ? (
          <LoadingView />
        ) : balances.error && !balances.data ? (
          <ErrorState error={balances.error} onRetry={refresh} />
        ) : (
          <>
            <SectionHeader title={t('m.financePlus.balances')} />
            {nonZero.length === 0 ? (
              <Card>
                <Text testID="shared-balances-settled">{t('m.financePlus.allSettled')}</Text>
              </Card>
            ) : (
              <RowGroup>
                {nonZero.map((b, i) => (
                  <View key={`${b.partyId}-${b.currency}`}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow
                      title={b.name}
                      subtitle={
                        b.balanceMinor > 0 ? t('m.financePlus.getsBack') : t('m.financePlus.owes')
                      }
                      right={
                        <Text
                          className={`font-semibold ${b.balanceMinor > 0 ? 'text-success' : 'text-danger'}`}
                        >
                          {fmt(b.balanceMinor, b.currency)}
                        </Text>
                      }
                    />
                  </View>
                ))}
              </RowGroup>
            )}

            {settle.data && settle.data.length > 0 ? (
              <>
                <SectionHeader title={t('m.financePlus.settleUp')} />
                <RowGroup>
                  {settle.data.map((s, i) => {
                    const amount = fmt(s.amountMinor, s.currency);
                    const label = t('m.financePlus.transfer', {
                      from: nameOf(s.fromPartyId),
                      to: nameOf(s.toPartyId),
                      amount,
                    });
                    return (
                      <View key={`${s.fromPartyId}-${s.toPartyId}-${s.currency}`}>
                        {i > 0 ? <Divider /> : null}
                        <View className="gap-2 px-4 py-3">
                          <View
                            className="flex-row items-center gap-2"
                            accessible
                            accessibilityLabel={label}
                          >
                            <Text className="font-semibold">{nameOf(s.fromPartyId)}</Text>
                            <ArrowRight size={16} color={colors.textMuted} />
                            <Text className="flex-1 font-semibold">{nameOf(s.toPartyId)}</Text>
                            <Text className="font-semibold">{amount}</Text>
                          </View>
                          {writable ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              title={t('m.financePlus.markPaid')}
                              loading={settleMutation.isPending}
                              onPress={() => {
                                void confirmAsync(t('m.financePlus.markPaid'), label, {
                                  confirmLabel: t('common.confirm'),
                                  cancelLabel: t('common.cancel'),
                                }).then((ok) => {
                                  if (ok) settleMutation.mutate(s);
                                });
                              }}
                            />
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </RowGroup>
              </>
            ) : null}
          </>
        )}

        <SectionHeader title={t('m.financePlus.recentExpenses')} />
        {expenses.isPending ? (
          <LoadingView />
        ) : !expenses.data || expenses.data.items.length === 0 ? (
          <EmptyState
            title={t('m.financePlus.noExpenses')}
            message={t('m.financePlus.noExpensesHint')}
          />
        ) : (
          <RowGroup>
            {expenses.data.items.map((e, i) => (
              <View key={e.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={e.title}
                  subtitle={`${t('m.financePlus.paidBy', { name: nameOf(e.paidByPartyId) })} · ${dateFmt.format(new Date(`${e.date}T12:00:00`))}`}
                  left={<Receipt size={22} color={colors.primary} />}
                  {...(writable
                    ? {
                        onPress: () => {
                          router.push({
                            pathname: '/finance/shared-expense',
                            params: { expenseId: e.id },
                          });
                        },
                        accessibilityHint: t('m.financePlus.tapToEdit'),
                      }
                    : {})}
                  right={<Text className="font-semibold">{fmt(e.amountMinor, e.currency)}</Text>}
                />
              </View>
            ))}
          </RowGroup>
        )}

        {settlements.data && settlements.data.length > 0 ? (
          <>
            <SectionHeader title={t('m.financePlus.settlements')} />
            <RowGroup>
              {settlements.data.map((st, i) => (
                <View key={st.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={t('m.financePlus.settlementRow', {
                      from: nameOf(st.fromPartyId),
                      to: nameOf(st.toPartyId),
                    })}
                    subtitle={[dateFmt.format(new Date(`${st.date}T12:00:00`)), st.note]
                      .filter(Boolean)
                      .join(' · ')}
                    left={<HandCoins size={22} color={colors.success} />}
                    right={
                      <View className="flex-row items-center">
                        <Text className="font-semibold">{fmt(st.amountMinor, st.currency)}</Text>
                        {writable ? (
                          <IconButton
                            label={t('m.financePlus.deleteSettlement')}
                            onPress={() => {
                              void confirmAsync(t('m.financePlus.deleteSettlement'), undefined, {
                                confirmLabel: t('common.delete'),
                                cancelLabel: t('common.cancel'),
                                destructive: true,
                              }).then((ok) => {
                                if (ok) removeSettlement.mutate(st.id);
                              });
                            }}
                          >
                            <Trash2 size={18} color={colors.textMuted} />
                          </IconButton>
                        ) : null}
                      </View>
                    }
                  />
                </View>
              ))}
            </RowGroup>
          </>
        ) : null}

        <SectionHeader title={t('m.financePlus.people')} />
        <RowGroup>
          {(parties.data ?? []).map((p, i) => (
            <View key={p.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={p.name}
                subtitle={
                  p.archived
                    ? t('m.financePlus.archived')
                    : p.memberId
                      ? t('m.financePlus.member')
                      : t('m.financePlus.external')
                }
                left={<User size={20} color={p.archived ? colors.textMuted : colors.primary} />}
                {...(writable && !p.memberId
                  ? {
                      chevron: true,
                      onPress: () => {
                        router.push({ pathname: '/finance/party', params: { partyId: p.id } });
                      },
                    }
                  : {})}
              />
            </View>
          ))}
        </RowGroup>
        {writable ? (
          <View className="flex-row items-end gap-2">
            <View className="flex-1">
              <TextField
                label={t('m.financePlus.addPerson')}
                value={personName}
                onChangeText={setPersonName}
                placeholder={t('m.financePlus.personPlaceholder')}
                onSubmitEditing={() => {
                  if (personName.trim()) addPerson.mutate(personName.trim());
                }}
              />
            </View>
            <IconButton
              label={t('m.financePlus.addPerson')}
              className="bg-primary"
              onPress={() => {
                if (personName.trim()) addPerson.mutate(personName.trim());
              }}
            >
              <UserPlus size={20} color={colors.primaryText} />
            </IconButton>
          </View>
        ) : null}
      </ScrollView>
      {writable ? (
        <Fab
          label={t('m.financePlus.newExpense')}
          onPress={() => {
            router.push('/finance/shared-expense');
          }}
        />
      ) : null}
    </View>
  );
}
