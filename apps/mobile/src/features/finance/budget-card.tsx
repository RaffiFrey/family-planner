import type { BudgetStatus } from '@fp/contracts';
import { budgetLevelColor } from '@fp/ui-tokens';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { z } from 'zod';
import { ProgressBar, Text } from '@/components/ui';
import { useCategoryLabels, useMoney } from './hooks';

type Status = z.infer<typeof BudgetStatus>;

const TEXT_TONE = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

/** One budget with spent/available and its ok/warning/exceeded level. */
export function BudgetLine({ status }: { status: Status }) {
  const { t } = useTranslation();
  const fmt = useMoney();
  const labels = useCategoryLabels();
  const name = labels.get(status.budget.categoryId) ?? t('categories.uncategorized');
  const tone = budgetLevelColor[status.level];
  return (
    <View
      className="gap-1.5"
      accessible
      accessibilityLabel={`${name}: ${t(`budgetLevels.${status.level}`)}`}
    >
      <View className="flex-row items-baseline justify-between gap-2">
        <Text className="flex-1" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" className={status.level === 'ok' ? '' : TEXT_TONE[tone]}>
          {fmt(status.spentMinor)} / {fmt(status.availableMinor)}
        </Text>
      </View>
      <ProgressBar ratio={status.ratio} tone={tone} label={name} />
      {status.level !== 'ok' ? (
        <Text variant="caption" className={TEXT_TONE[tone]}>
          {t(`budgetLevels.${status.level}`)}
        </Text>
      ) : null}
    </View>
  );
}
