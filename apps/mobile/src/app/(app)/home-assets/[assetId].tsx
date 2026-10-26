import type { HomeAsset } from '@fp/contracts';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  BarChart3,
  Camera,
  FileText,
  Gauge,
  ImagePlus,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useMoney } from '@/features/finance/hooks';
import {
  ensureRootFolder,
  type PickedFile,
  pickDocument,
  pickImage,
  uploadToStorage,
} from '@/features/files/file-transfer';
import {
  DETAIL_FIELDS,
  useAsset,
  useDeleteReading,
  useMaintenance,
  useMaintenanceLogs,
  useReadings,
} from '@/features/home-assets/hooks';
import { MaintenanceRow } from '@/features/home-assets/maintenance-row';
import { openStoredFile } from '@/features/home-assets/receipts';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { confirmAsync, showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

export default function AssetDetailScreen() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const money = useMoney();
  const { householdId, can } = useHousehold();
  const queryClient = useQueryClient();
  const asset = useAsset(assetId);
  const plans = useMaintenance({ assetId });
  const readings = useReadings(assetId);
  const { logs } = useMaintenanceLogs(plans.data ?? []);
  const deleteReading = useDeleteReading();
  const writable = can('home.write');
  const remove = useMutation({
    mutationFn: () => api.home.assets.remove({ params: { householdId, assetId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['home'] });
      router.back();
    },
    onError: (e) => {
      showError(e, t);
    },
  });

  if (asset.isPending) return <LoadingView />;
  if (asset.error && !asset.data)
    return <ErrorState error={asset.error} onRetry={() => void asset.refetch()} />;
  const a = asset.data;
  const fmtDay = (k: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${k}T12:00:00`));
  const fmtDate = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const known = DETAIL_FIELDS[a.kind];
  const rank = (k: string) => (known.includes(k) ? known.indexOf(k) : 99);
  const details = Object.entries(a.details).sort(([x], [y]) => rank(x) - rank(y));

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={asset.isRefetching}
          onRefresh={() => void queryClient.invalidateQueries({ queryKey: ['home'] })}
        />
      }
    >
      <Stack.Screen
        options={{
          title: a.name,
          headerRight: () =>
            writable ? (
              <View className="flex-row">
                <IconButton
                  label={t('common.edit')}
                  onPress={() => {
                    router.push({ pathname: '/home-assets/asset-edit', params: { assetId } });
                  }}
                >
                  <Pencil size={20} color={colors.text} />
                </IconButton>
                <IconButton
                  label={t('common.delete')}
                  onPress={() => {
                    void confirmAsync(
                      t('m.homeAssets.deleteAsset'),
                      t('m.homeAssets.deleteAssetHint'),
                      {
                        confirmLabel: t('common.delete'),
                        cancelLabel: t('common.cancel'),
                        destructive: true,
                      },
                    ).then((ok) => {
                      if (ok) remove.mutate();
                    });
                  }}
                >
                  <Trash2 size={20} color={colors.danger} />
                </IconButton>
              </View>
            ) : null,
        }}
      />
      <Card>
        <Text variant="caption">{t(`m.homeAssets.kinds.${a.kind}`)}</Text>
        <Text variant="heading">{a.name}</Text>
        {details.map(([k, v]) => (
          <Text key={k}>
            <Text className="text-muted">
              {known.includes(k) ? t(`m.homeAssets.fields.${k}`) : k}:{' '}
            </Text>
            {v}
          </Text>
        ))}
        {a.purchaseDate ? (
          <Text>{t('m.homeAssets.purchasedOn', { date: fmtDay(a.purchaseDate) })}</Text>
        ) : null}
        {a.warrantyUntil ? (
          <Text>{t('m.homeAssets.warrantyUntil', { date: fmtDay(a.warrantyUntil) })}</Text>
        ) : null}
        {a.notes ? <Text variant="caption">{a.notes}</Text> : null}
      </Card>

      <SectionHeader
        title={t('m.homeAssets.maintenance')}
        action={
          writable ? (
            <Button
              size="sm"
              variant="ghost"
              title={t('m.homeAssets.addPlan')}
              icon={<Plus size={16} color={colors.primary} />}
              onPress={() => {
                router.push({ pathname: '/home-assets/maintenance-new', params: { assetId } });
              }}
            />
          ) : null
        }
      />
      {plans.isPending ? (
        <LoadingView />
      ) : plans.error && !plans.data ? (
        <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
      ) : plans.data.length === 0 ? (
        <EmptyState title={t('m.homeAssets.noPlans')} />
      ) : (
        <RowGroup>
          {plans.data.map((p, i) => (
            <View key={p.id}>
              {i > 0 ? <Divider /> : null}
              <MaintenanceRow plan={p} />
            </View>
          ))}
        </RowGroup>
      )}

      {logs.length > 0 ? (
        <>
          <SectionHeader title={t('m.homeAssets.history')} />
          <RowGroup>
            {logs.slice(0, 10).map((log, i) => (
              <View key={log.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={`${log.planTitle} · ${fmtDay(log.doneOn)}`}
                  subtitle={
                    [log.costMinor !== null ? money(log.costMinor) : null, log.notes]
                      .filter(Boolean)
                      .join(' · ') || null
                  }
                />
              </View>
            ))}
          </RowGroup>
        </>
      ) : null}

      <SectionHeader
        title={t('m.homeAssets.readings')}
        action={
          writable ? (
            <Button
              size="sm"
              variant="ghost"
              title={t('m.homeAssets.addReading')}
              icon={<Gauge size={16} color={colors.primary} />}
              onPress={() => {
                router.push({ pathname: '/home-assets/meter', params: { assetId } });
              }}
            />
          ) : null
        }
      />
      {readings.isPending ? (
        <LoadingView />
      ) : readings.error && !readings.data ? (
        <ErrorState error={readings.error} onRetry={() => void readings.refetch()} />
      ) : readings.data.length === 0 ? (
        <EmptyState title={t('m.homeAssets.noReadings')} />
      ) : (
        <>
          <Button
            variant="secondary"
            size="sm"
            title={t('m.homeAssets.showConsumption')}
            icon={<BarChart3 size={16} color={colors.text} />}
            onPress={() => {
              router.push({ pathname: '/home-assets/consumption', params: { assetId } });
            }}
          />
          <RowGroup>
            {[...readings.data]
              .sort((x, y) => y.readAt.localeCompare(x.readAt))
              .slice(0, 20)
              .map((r, i) => (
                <View key={r.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={`${Number(r.value).toLocaleString(locale)} ${r.unit}`}
                    subtitle={`${t(`m.homeAssets.meterTypes.${r.meterType}`)} · ${fmtDate.format(new Date(r.readAt))}${r.note ? ` · ${r.note}` : ''}`}
                    right={
                      writable ? (
                        <IconButton
                          label={t('m.homeAssets.deleteReadingLabel', {
                            value: `${r.value} ${r.unit}`,
                          })}
                          onPress={() => {
                            deleteReading(r);
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
        </>
      )}

      <Receipts asset={a} />
    </ScrollView>
  );
}

/** Receipts / invoices attached to the asset (stored in the "Belege" folder). */
function Receipts({ asset }: { asset: HomeAsset }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId, can } = useHousehold();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const writable = can('home.write');
  const files = useQueries({
    queries: asset.receiptFileIds.map((fileId) => ({
      queryKey: ['storage', 'getFile', { householdId, fileId }],
      queryFn: () => api.storage.getFile({ params: { householdId, fileId } }),
    })),
  });

  const setIds = async (receiptFileIds: string[]) => {
    await api.home.assets.update({
      params: { householdId, assetId: asset.id },
      body: { receiptFileIds },
    });
    await queryClient.invalidateQueries({ queryKey: ['home'] });
  };

  const attach = async (pick: () => Promise<PickedFile | null>) => {
    setBusy(true);
    try {
      const picked = await pick();
      if (!picked) return;
      const folderId = await ensureRootFolder(householdId, t('m.finance.receiptsFolder'));
      const stored = await uploadToStorage(householdId, folderId, picked);
      await setIds([...asset.receiptFileIds, stored.id].slice(0, 20));
    } catch (e) {
      showError(e, t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionHeader title={t('m.homeAssets.receipts')} />
      {asset.receiptFileIds.length === 0 ? (
        <Text variant="caption">{t('m.homeAssets.noReceipts')}</Text>
      ) : (
        <RowGroup>
          {asset.receiptFileIds.map((fileId, i) => {
            const file = files[i]?.data;
            return (
              <View key={fileId}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={file?.name ?? t('common.loading')}
                  left={<FileText size={20} color={colors.primary} />}
                  {...(file
                    ? {
                        onPress: () => {
                          openStoredFile(householdId, file).catch((e: unknown) => {
                            showError(e, t);
                          });
                        },
                      }
                    : {})}
                  right={
                    writable ? (
                      <IconButton
                        label={t('m.homeAssets.removeReceipt')}
                        onPress={() => {
                          void confirmAsync(t('m.homeAssets.removeReceipt'), file?.name, {
                            confirmLabel: t('common.delete'),
                            cancelLabel: t('common.cancel'),
                            destructive: true,
                          }).then(async (ok) => {
                            if (!ok) return;
                            await setIds(asset.receiptFileIds.filter((id) => id !== fileId)).catch(
                              (e: unknown) => {
                                showError(e, t);
                              },
                            );
                          });
                        }}
                      >
                        <X size={18} color={colors.textMuted} />
                      </IconButton>
                    ) : null
                  }
                />
              </View>
            );
          })}
        </RowGroup>
      )}
      {writable ? (
        <View className="flex-row flex-wrap gap-2">
          {Platform.OS !== 'web' ? (
            <Button
              size="sm"
              variant="secondary"
              title={t('m.homeAssets.receiptCamera')}
              icon={<Camera size={16} color={colors.text} />}
              disabled={busy}
              onPress={() => void attach(() => pickImage('camera'))}
            />
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            title={t('m.homeAssets.receiptPhoto')}
            icon={<ImagePlus size={16} color={colors.text} />}
            disabled={busy}
            onPress={() => void attach(() => pickImage('library'))}
          />
          <Button
            size="sm"
            variant="secondary"
            title={t('m.homeAssets.receiptDocument')}
            icon={<Paperclip size={16} color={colors.text} />}
            loading={busy}
            onPress={() => void attach(pickDocument)}
          />
        </View>
      ) : null}
    </>
  );
}
