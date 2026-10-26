import type { Action } from '@fp/domain/permissions';
import * as WebBrowser from 'expo-web-browser';
import { Lock, Sparkles } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, EmptyState, LoadingView, Text } from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { type PlanFeature, useFeature } from '@/lib/entitlements';
import { WEB_URL } from '@/lib/env';
import { useColors } from '@/lib/theme';

/** "This needs Family Plus/Pro" card; owners can open the web billing page. */
export function UpsellState({ feature, compact }: { feature: PlanFeature; compact?: boolean }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { can } = useHousehold();
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={t('m.upsell.title')}
      testID={`upsell-${feature}`}
      className={`items-center gap-3 rounded-lg border border-primary bg-surface ${compact ? 'px-4 py-5' : 'px-6 py-10'}`}
    >
      <Sparkles size={28} color={colors.primary} />
      <Text variant="subheading" className="text-center">
        {t('m.upsell.title')}
      </Text>
      <Text variant="caption" className="text-center">
        {t(`m.upsell.features.${feature}`)}
      </Text>
      {can('household.billing') ? (
        <Button
          title={t('m.upsell.cta')}
          onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/settings/billing`)}
        />
      ) : (
        <Text variant="caption" className="text-center">
          {t('m.upsell.askOwner')}
        </Text>
      )}
    </View>
  );
}

/** Renders children only when the plan includes `feature`; otherwise an upsell. */
export function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: PlanFeature;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { enabled } = useFeature(feature);
  if (enabled === undefined) return <LoadingView />;
  if (!enabled)
    return (
      <>
        {fallback ?? (
          <View className="flex-1 bg-background p-4">
            <UpsellState feature={feature} />
          </View>
        )}
      </>
    );
  return <>{children}</>;
}

/** Permission gate for a whole module screen. */
export function ModuleGate({ action, children }: { action: Action; children: ReactNode }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { can } = useHousehold();
  if (!can(action))
    return (
      <View className="flex-1 items-center bg-background pt-10">
        <Lock size={32} color={colors.textMuted} />
        <EmptyState title={t('errors.forbidden')} />
      </View>
    );
  return <>{children}</>;
}
