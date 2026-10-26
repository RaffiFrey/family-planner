import { ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { FeatureGate } from '@/components/gates';
import {
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingView,
  RowGroup,
  Text,
} from '@/components/ui';
import { useMoney } from '@/features/finance/hooks';
import { useInsurance } from '@/features/finance-plus/hooks';
import { useColors } from '@/lib/theme';

export default function InsuranceScreen() {
  return (
    <FeatureGate feature="contracts">
      <Insurance />
    </FeatureGate>
  );
}

/** Insurance policies with their yearly cost (subset of the contracts). */
function Insurance() {
  const { t } = useTranslation();
  const colors = useColors();
  const fmt = useMoney();
  const overview = useInsurance();
  if (overview.isPending) return <LoadingView />;
  if (overview.error && !overview.data)
    return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  const data = overview.data;
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={overview.isRefetching}
          onRefresh={() => void overview.refetch()}
        />
      }
    >
      <Card>
        <Text variant="caption">{t('m.financePlus.insuranceYearly')}</Text>
        <Text variant="title">{fmt(data.yearlyMinor, data.currency)}</Text>
        <Text variant="caption">
          {t('m.financePlus.perMonthPlain', { amount: fmt(data.monthlyMinor, data.currency) })}
        </Text>
      </Card>
      {data.contracts.length === 0 ? (
        <EmptyState title={t('m.financePlus.noInsurance')} />
      ) : (
        <RowGroup>
          {data.contracts.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={c.name}
                subtitle={[c.providerName, c.contractNumber].filter(Boolean).join(' · ') || null}
                left={<ShieldCheck size={22} color={colors.primary} />}
                right={
                  <View className="items-end">
                    <Text className="font-semibold">{fmt(c.yearlyMinor, c.currency)}</Text>
                    <Text variant="caption">{t('m.financePlus.perYear')}</Text>
                  </View>
                }
              />
            </View>
          ))}
        </RowGroup>
      )}
    </ScrollView>
  );
}
