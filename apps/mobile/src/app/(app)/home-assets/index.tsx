import { router } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { ModuleGate } from '@/components/gates';
import {
  Divider,
  EmptyState,
  ErrorState,
  Fab,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Segmented,
} from '@/components/ui';
import {
  ASSET_KINDS,
  KIND_ICONS,
  useAssets,
  useWarranties,
  useMaintenance,
} from '@/features/home-assets/hooks';
import { MaintenanceRow } from '@/features/home-assets/maintenance-row';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';

type Tab = 'due' | 'assets';

export default function HomeAssetsScreen() {
  return (
    <ModuleGate action="home.read">
      <HomeAssets />
    </ModuleGate>
  );
}

function HomeAssets() {
  const { t } = useTranslation();
  const colors = useColors();
  const { can } = useHousehold();
  const [tab, setTab] = useState<Tab>('due');
  const assets = useAssets();
  const due = useMaintenance({ withinDays: 60 });
  const assetNames = new Map((assets.data ?? []).map((a) => [a.id, a.name]));
  const duePlans = (due.data ?? [])
    .filter((p) => p.status === 'due' || p.status === 'upcoming')
    .sort((a, b) => (a.nextDueOn ?? '9999').localeCompare(b.nextDueOn ?? '9999'));

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-28"
        refreshControl={
          <RefreshControl
            refreshing={assets.isRefetching || due.isRefetching}
            onRefresh={() => {
              void assets.refetch();
              void due.refetch();
            }}
          />
        }
      >
        <Segmented<Tab>
          label={t('m.homeAssets.view')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'due', label: t('m.homeAssets.dueTab') },
            { value: 'assets', label: t('m.homeAssets.assetsTab') },
          ]}
        />
        {tab === 'due' ? (
          due.isPending ? (
            <LoadingView />
          ) : due.error && !due.data ? (
            <ErrorState error={due.error} onRetry={() => void due.refetch()} />
          ) : duePlans.length === 0 ? (
            <EmptyState
              title={t('m.homeAssets.nothingDue')}
              message={t('m.homeAssets.nothingDueHint')}
            />
          ) : (
            <RowGroup>
              {duePlans.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <Divider /> : null}
                  <MaintenanceRow plan={p} assetName={assetNames.get(p.assetId)} />
                </View>
              ))}
            </RowGroup>
          )
        ) : assets.isPending ? (
          <LoadingView />
        ) : assets.error && !assets.data ? (
          <ErrorState error={assets.error} onRetry={() => void assets.refetch()} />
        ) : assets.data.length === 0 ? (
          <EmptyState title={t('m.homeAssets.empty')} message={t('m.homeAssets.emptyHint')} />
        ) : (
          ASSET_KINDS.map((kind) => {
            const list = assets.data.filter((a) => a.kind === kind);
            if (list.length === 0) return null;
            const Icon = KIND_ICONS[kind];
            return (
              <View key={kind} className="gap-2">
                <SectionHeader title={t(`m.homeAssets.kindsPlural.${kind}`)} />
                <RowGroup>
                  {list.map((a, i) => (
                    <View key={a.id}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow
                        title={a.name}
                        subtitle={a.details.plate ?? a.details.model ?? a.details.address ?? null}
                        left={<Icon size={22} color={colors.primary} />}
                        chevron
                        onPress={() => {
                          router.push({
                            pathname: '/home-assets/[assetId]',
                            params: { assetId: a.id },
                          });
                        }}
                      />
                    </View>
                  ))}
                </RowGroup>
              </View>
            );
          })
        )}
        {tab === 'due' ? <Warranties /> : null}
      </ScrollView>
      {can('home.write') ? (
        <Fab
          label={t('m.homeAssets.addAsset')}
          onPress={() => {
            router.push('/home-assets/asset-edit');
          }}
        />
      ) : null}
    </View>
  );
}

/** Assets whose warranty ends within the next 90 days. */
function Warranties() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const warranties = useWarranties(90);
  if (!warranties.data || warranties.data.length === 0) return null;
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  return (
    <View className="gap-2">
      <SectionHeader title={t('m.homeAssets.warrantiesEnding')} />
      <RowGroup>
        {warranties.data.map((a, i) => {
          const Icon = KIND_ICONS[a.kind];
          return (
            <View key={a.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={a.name}
                subtitle={
                  a.warrantyUntil
                    ? t('m.homeAssets.warrantyUntil', {
                        date: fmt.format(new Date(`${a.warrantyUntil}T12:00:00`)),
                      })
                    : null
                }
                left={<ShieldAlert size={22} color={colors.warning} />}
                right={<Icon size={18} color={colors.textMuted} />}
                chevron
                onPress={() => {
                  router.push({ pathname: '/home-assets/[assetId]', params: { assetId: a.id } });
                }}
              />
            </View>
          );
        })}
      </RowGroup>
    </View>
  );
}
