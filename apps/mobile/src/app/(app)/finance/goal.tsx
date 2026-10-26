import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  LoadingView,
  ProgressBar,
  RowGroup,
  SectionHeader,
  Segmented,
  Text,
  TextField,
} from '@/components/ui';
import { useMoney } from '@/features/finance/hooks';
import { useContributions, useFinancePlusMutation, useGoals } from '@/features/finance-plus/hooks';
import { MoneyField, useParseMoney } from '@/features/finance-plus/money-field';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

/** Goal progress, contribution entry (deposit / withdrawal) and history. */
export default function GoalScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const fmt = useMoney();
  const parse = useParseMoney();
  const { can, me } = useHousehold();
  const members = useMemberMap();
  const writable = can('finance.write');
  const goals = useGoals(true);
  const contributions = useContributions(goalId);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<'deposit' | 'withdraw'>('deposit');
  const [amountError, setAmountError] = useState<string | undefined>();

  const add = useFinancePlusMutation(
    (householdId, v: { amountMinor: number; note: string | null }) =>
      api.financePlus.addContribution({
        params: { householdId, goalId },
        body: { amountMinor: v.amountMinor, note: v.note, memberId: me.id },
      }),
    () => {
      setAmount('');
      setNote('');
    },
  );
  const removeContribution = useFinancePlusMutation((householdId, contributionId: string) =>
    api.financePlus.removeContribution({ params: { householdId, goalId, contributionId } }),
  );
  const archive = useFinancePlusMutation((householdId, archived: boolean) =>
    api.financePlus.updateGoal({ params: { householdId, goalId }, body: { archived } }),
  );
  const removeGoal = useFinancePlusMutation(
    (householdId, _v: undefined) => api.financePlus.deleteGoal({ params: { householdId, goalId } }),
    () => {
      router.back();
    },
  );

  const goal = goals.data?.find((g) => g.id === goalId);
  if (goals.isPending) return <LoadingView />;
  if (!goal) return <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />;
  const currency = goal.currency;

  const submit = () => {
    const minor = parse(amount);
    if (minor === null) {
      setAmountError(t('m.finance.enterAmount'));
      return;
    }
    setAmountError(undefined);
    add.mutate({
      amountMinor: kind === 'deposit' ? minor : -minor,
      note: note.trim() === '' ? null : note.trim(),
    });
  };

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: goal.name,
          headerRight: () =>
            writable ? (
              <View className="flex-row">
                <IconButton
                  label={t('m.financePlus.editGoal')}
                  onPress={() => {
                    router.push({ pathname: '/finance/goal-new', params: { goalId } });
                  }}
                >
                  <Pencil size={20} color={colors.text} />
                </IconButton>
                <IconButton
                  label={goal.archived ? t('m.financePlus.unarchive') : t('m.financePlus.archive')}
                  onPress={() => {
                    archive.mutate(!goal.archived);
                  }}
                >
                  {goal.archived ? (
                    <ArchiveRestore size={20} color={colors.text} />
                  ) : (
                    <Archive size={20} color={colors.text} />
                  )}
                </IconButton>
                <IconButton
                  label={t('m.financePlus.deleteGoal')}
                  onPress={() => {
                    void confirmAsync(t('m.financePlus.deleteGoal'), goal.name, {
                      confirmLabel: t('common.delete'),
                      cancelLabel: t('common.cancel'),
                      destructive: true,
                    }).then((ok) => {
                      if (ok) removeGoal.mutate(undefined);
                    });
                  }}
                >
                  <Trash2 size={20} color={colors.text} />
                </IconButton>
              </View>
            ) : null,
        }}
      />
      <Card>
        {goal.archived ? <Text variant="caption">{t('m.financePlus.archivedGoal')}</Text> : null}
        <Text variant="title">{fmt(goal.savedMinor, currency)}</Text>
        <ProgressBar
          ratio={goal.ratio}
          tone={goal.reached ? 'success' : 'primary'}
          label={goal.name}
        />
        <Text variant="caption">
          {goal.reached
            ? t('m.financePlus.reached')
            : t('m.financePlus.remaining', { amount: fmt(goal.remainingMinor, currency) })}
        </Text>
        {goal.progressSource === 'account' ? (
          <Text variant="caption">{t('m.financePlus.accountLinked')}</Text>
        ) : null}
      </Card>

      {writable && goal.progressSource === 'contributions' ? (
        <Card>
          <Segmented
            label={t('m.financePlus.contribution')}
            value={kind}
            onChange={setKind}
            options={[
              { value: 'deposit', label: t('m.financePlus.deposit') },
              { value: 'withdraw', label: t('m.financePlus.withdraw') },
            ]}
          />
          <MoneyField
            label={t('m.finance.amount')}
            value={amount}
            onChangeText={setAmount}
            error={amountError}
          />
          <TextField
            label={t('m.finance.notes')}
            value={note}
            onChangeText={setNote}
            placeholder={t('common.optional')}
          />
          <Button
            title={kind === 'deposit' ? t('m.financePlus.deposit') : t('m.financePlus.withdraw')}
            loading={add.isPending}
            onPress={submit}
          />
        </Card>
      ) : null}

      <SectionHeader title={t('m.financePlus.history')} />
      {contributions.isPending ? (
        <LoadingView />
      ) : !contributions.data || contributions.data.length === 0 ? (
        <EmptyState title={t('m.financePlus.noContributions')} />
      ) : (
        <RowGroup>
          {contributions.data.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={fmt(c.amountMinor, currency)}
                subtitle={[
                  dateFmt.format(new Date(`${c.date}T12:00:00`)),
                  c.memberId ? members.get(c.memberId)?.displayName : null,
                  c.note,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={
                  writable ? (
                    <IconButton
                      label={t('common.delete')}
                      onPress={() => {
                        removeContribution.mutate(c.id);
                      }}
                    >
                      <Trash2 size={18} color={colors.textMuted} />
                    </IconButton>
                  ) : null
                }
              />
            </View>
          ))}
        </RowGroup>
      )}
    </ScrollView>
  );
}
