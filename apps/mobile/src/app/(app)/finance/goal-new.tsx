import { MEMBER_COLORS } from '@fp/ui-tokens';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ChipSelect,
  DateField,
  ErrorState,
  LoadingView,
  ScreenScroll,
  TextField,
} from '@/components/ui';
import { dayKey, parseDayKey } from '@/features/calendar/dates';
import { useAmountFormat } from '@/features/finance/hooks';
import { useFinancePlusMutation, useGoals } from '@/features/finance-plus/hooks';
import { MoneyField, useParseMoney } from '@/features/finance-plus/money-field';
import { minorToMoneyText } from '@/features/finance-plus/money-text';
import { api } from '@/lib/api';

type Goal = NonNullable<ReturnType<typeof useGoals>['data']>[number];

/** Create a savings goal, or edit one with `?goalId=`. */
export default function GoalFormScreen() {
  const { goalId } = useLocalSearchParams<{ goalId?: string }>();
  const { t } = useTranslation();
  const goals = useGoals(true);
  if (goalId && goals.isPending) return <LoadingView />;
  const goal = goalId ? goals.data?.find((g) => g.id === goalId) : undefined;
  if (goalId && !goal) return <ErrorState error={goals.error ?? new Error('not found')} />;
  return (
    <>
      {goal ? <Stack.Screen options={{ title: t('m.financePlus.editGoal') }} /> : null}
      <GoalForm goal={goal} />
    </>
  );
}

function GoalForm({ goal }: { goal: Goal | undefined }) {
  const { t } = useTranslation();
  const parse = useParseMoney();
  const format = useAmountFormat();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(
    goal ? minorToMoneyText(goal.targetMinor, format.exponent, format.style) : '',
  );
  const [deadline, setDeadline] = useState<Date | null>(
    goal?.deadline ? parseDayKey(goal.deadline) : null,
  );
  const [color, setColor] = useState<string>(goal?.color ?? MEMBER_COLORS[0]);
  const [errors, setErrors] = useState<{ name?: string; target?: string }>({});

  const save = useFinancePlusMutation(
    (
      householdId,
      body: { name: string; targetMinor: number; deadline: string | null; color: string },
    ) =>
      goal
        ? api.financePlus.updateGoal({ params: { householdId, goalId: goal.id }, body })
        : api.financePlus.createGoal({ params: { householdId }, body }),
    () => {
      router.back();
    },
  );

  const submit = () => {
    const targetMinor = parse(target);
    const next: typeof errors = {};
    if (name.trim() === '') next.name = t('m.financePlus.nameRequired');
    if (targetMinor === null) next.target = t('m.finance.enterAmount');
    setErrors(next);
    if (targetMinor === null || next.name) return;
    save.mutate({
      name: name.trim(),
      targetMinor,
      deadline: deadline ? dayKey(deadline) : null,
      color,
    });
  };

  return (
    <ScreenScroll>
      <TextField
        label={t('common.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('m.financePlus.goalNamePlaceholder')}
        error={errors.name}
        autoFocus={!goal}
      />
      <MoneyField
        label={t('m.financePlus.target')}
        value={target}
        onChangeText={setTarget}
        error={errors.target}
      />
      <DateField
        label={t('m.financePlus.deadline')}
        value={deadline}
        onChange={setDeadline}
        clearable
        minimumDate={new Date()}
      />
      <ChipSelect
        label={t('m.family.color')}
        value={color}
        onChange={setColor}
        options={MEMBER_COLORS.map((c, i) => ({ value: c, label: String(i + 1), color: c }))}
      />
      <Button title={t('common.save')} loading={save.isPending} onPress={submit} />
    </ScreenScroll>
  );
}
