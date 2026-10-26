import type { MaintenancePlan } from '@fp/contracts';
import { router } from 'expo-router';
import { Wrench } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, ListRow, Text } from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';

const TONE: Record<MaintenancePlan['status'], { bg: string; text: string }> = {
  ok: { bg: 'bg-surface-muted', text: 'text-muted' },
  upcoming: { bg: 'bg-warning', text: 'text-white' },
  due: { bg: 'bg-danger', text: 'text-white' },
  ended: { bg: 'bg-surface-muted', text: 'text-muted' },
};

/** Plan row: tap to edit, "Erledigt" opens the completion form (date, cost, notes). */
export function MaintenanceRow({
  plan,
  assetName,
}: {
  plan: MaintenancePlan;
  assetName?: string | undefined;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { can } = useHousehold();
  const writable = can('home.write');
  const due = plan.nextDueOn
    ? t('m.homeAssets.dueOn', {
        date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
          new Date(`${plan.nextDueOn}T12:00:00`),
        ),
      })
    : t('m.homeAssets.noDueDate');
  const tone = TONE[plan.status];
  return (
    <View>
      <ListRow
        title={plan.title}
        subtitle={[assetName, due].filter(Boolean).join(' · ')}
        left={<Wrench size={20} color={colors.primary} />}
        right={
          <View className={`rounded-full px-2 py-0.5 ${tone.bg}`}>
            <Text className={`text-xs font-semibold ${tone.text}`}>
              {t(`m.homeAssets.status.${plan.status}`)}
            </Text>
          </View>
        }
        {...(writable
          ? {
              accessibilityHint: t('m.homeAssets.editPlanHint'),
              onPress: () => {
                router.push({
                  pathname: '/home-assets/maintenance-edit',
                  params: { planId: plan.id, assetId: plan.assetId },
                });
              },
            }
          : {})}
      />
      {writable && plan.status !== 'ended' ? (
        <View className="flex-row justify-end px-4 pb-3">
          <Button
            size="sm"
            variant="secondary"
            title={t('m.homeAssets.markDone')}
            accessibilityLabel={t('m.homeAssets.markDoneLabel', { title: plan.title })}
            onPress={() => {
              router.push({
                pathname: '/home-assets/maintenance-complete',
                params: { planId: plan.id, assetId: plan.assetId },
              });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
