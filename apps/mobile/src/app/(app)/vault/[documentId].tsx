import { ApiError } from '@fp/api-client';
import type { VaultDocument } from '@fp/contracts';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Copy, Pencil, ScanText } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { UpsellState } from '@/components/gates';
import {
  Button,
  Card,
  Divider,
  ErrorState,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { Attachments } from '@/features/vault/attachments';
import { isLocalDate } from '@/features/vault/expiry';
import { useVaultDocument, useVaultMutations } from '@/features/vault/hooks';
import { ExpiryBadge, TYPE_ICONS, useFormatLocalDate, useTypeLabel } from '@/features/vault/ui';
import { isPlanLimit } from '@/lib/errors';
import { confirmAsync, notify, showError } from '@/lib/dialogs';
import { useFeature } from '@/lib/entitlements';
import { useColors } from '@/lib/theme';

export default function VaultDocumentScreen() {
  const { documentId } = useLocalSearchParams<{ documentId: string }>();
  const doc = useVaultDocument(documentId);
  if (doc.isPending) return <LoadingView />;
  if (doc.isError && !doc.data)
    return <ErrorState error={doc.error} onRetry={() => void doc.refetch()} />;
  return (
    <DocumentDetail
      doc={doc.data}
      refreshing={doc.isRefetching}
      onRefresh={() => void doc.refetch()}
    />
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View className="gap-0.5 px-4 py-3">
      <Text variant="caption">{label}</Text>
      <Text selectable>{value}</Text>
    </View>
  );
}

function DocumentDetail({
  doc,
  refreshing,
  onRefresh,
}: {
  doc: VaultDocument;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const { can } = useHousehold();
  const members = useMemberMap();
  const typeLabel = useTypeLabel();
  const formatDate = useFormatLocalDate();
  const ocr = useFeature('ocr');
  const { update, remove, runOcr } = useVaultMutations();
  const writable = can('vault.write');
  const Icon = TYPE_ICONS[doc.type];
  const holder = doc.holderMemberId ? members.get(doc.holderMemberId)?.displayName : null;

  const patch = (body: Parameters<typeof update.mutate>[0]['body'], onDone?: () => void) => {
    update.mutate(
      { id: doc.id, body },
      {
        onSuccess: () => onDone?.(),
        onError: (e) => {
          showError(e, t);
        },
      },
    );
  };

  const startOcr = () => {
    runOcr.mutate(doc.id, {
      onError: (e) => {
        if (isPlanLimit(e)) notify(t('m.upsell.title'), t('m.upsell.features.ocr'));
        else showError(e, t);
      },
    });
  };

  const onAttached = async (fileId: string) => {
    await update.mutateAsync({ id: doc.id, body: { fileIds: [...doc.fileIds, fileId] } });
    // Read the new file right away when the plan includes text recognition.
    if (ocr.enabled) {
      try {
        await runOcr.mutateAsync(doc.id);
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
      }
    }
  };

  const confirmDelete = async () => {
    const ok = await confirmAsync(t('m.vault.deleteTitle'), t('m.vault.deleteMessage'), {
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(doc.id, {
      onSuccess: () => {
        router.back();
      },
      onError: (e) => {
        showError(e, t);
      },
    });
  };

  const s = doc.suggestions;
  const suggestionRows: {
    key: string;
    label: string;
    display: string;
    apply: () => void;
    applied: boolean;
  }[] = [];
  if (s) {
    for (const sug of s.expiresAt.slice(0, 2))
      if (isLocalDate(sug.value))
        suggestionRows.push({
          key: `exp-${sug.value}`,
          label: t('m.vault.expiresOn'),
          display: formatDate(sug.value),
          applied: doc.expiresOn === sug.value,
          apply: () => {
            patch({ expiresOn: sug.value });
          },
        });
    for (const sug of s.issuedAt.slice(0, 2))
      if (isLocalDate(sug.value))
        suggestionRows.push({
          key: `iss-${sug.value}`,
          label: t('m.vault.issuedOn'),
          display: formatDate(sug.value),
          applied: doc.issuedOn === sug.value,
          apply: () => {
            patch({ issuedOn: sug.value });
          },
        });
    for (const sug of s.documentNumber.slice(0, 2))
      suggestionRows.push({
        key: `num-${sug.value}`,
        label: t('m.vault.documentNumber'),
        display: sug.value,
        applied: doc.documentNumber === sug.value,
        apply: () => {
          patch({ documentNumber: sug.value });
        },
      });
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Stack.Screen
        options={{
          title: doc.title,
          headerRight: () =>
            writable ? (
              <IconButton
                label={t('common.edit')}
                onPress={() => {
                  router.push({ pathname: '/vault/edit', params: { documentId: doc.id } });
                }}
              >
                <Pencil size={20} color={colors.text} />
              </IconButton>
            ) : null,
        }}
      />
      <View className="flex-row items-center gap-3">
        <Icon size={32} color={colors.primary} />
        <View className="flex-1 gap-1">
          <Text variant="heading">{doc.title}</Text>
          <Text variant="caption">{[typeLabel(doc.type), holder].filter(Boolean).join(' · ')}</Text>
          <ExpiryBadge doc={doc} />
        </View>
      </View>

      <RowGroup>
        {doc.documentNumber ? (
          <ListRow
            title={doc.documentNumber}
            subtitle={t('m.vault.documentNumber')}
            right={
              <IconButton
                label={t('m.vault.copyNumber')}
                onPress={() => {
                  void Clipboard.setStringAsync(doc.documentNumber ?? '').then(() => {
                    notify(t('m.vault.copied'));
                  });
                }}
              >
                <Copy size={18} color={colors.textMuted} />
              </IconButton>
            }
          />
        ) : null}
        <Field label={t('m.vault.issuer')} value={doc.issuer} />
        <Field
          label={t('m.vault.issuedOn')}
          value={doc.issuedOn ? formatDate(doc.issuedOn) : null}
        />
        <Field
          label={t('m.vault.expiresOn')}
          value={doc.expiresOn ? formatDate(doc.expiresOn) : null}
        />
        <Field label={t('m.vault.tags')} value={doc.tags.length > 0 ? doc.tags.join(', ') : null} />
        <Field label={t('m.vault.notes')} value={doc.notes} />
        <Field label={t('m.common.visibility')} value={t(`visibility.${doc.visibility}`)} />
      </RowGroup>
      {doc.expiresOn && doc.reminderLeadDays.length > 0 ? (
        <Text variant="caption">
          {t('m.vault.remindersInfo', {
            days: [...doc.reminderLeadDays].sort((a, b) => b - a).join(', '),
          })}
        </Text>
      ) : null}

      <SectionHeader title={t('m.vault.attachments')} />
      <Attachments
        fileIds={doc.fileIds}
        writable={writable}
        onAttached={onAttached}
        onDetach={(fileId) => {
          patch({ fileIds: doc.fileIds.filter((id) => id !== fileId) });
        }}
      />

      <SectionHeader title={t('m.vault.ocrTitle')} />
      {ocr.enabled === false ? (
        <UpsellState feature="ocr" compact />
      ) : (
        <Card>
          <View className="flex-row items-center gap-2">
            <ScanText size={20} color={colors.primary} />
            <Text className="flex-1">{t(`m.vault.ocrStatus.${doc.ocrStatus}`)}</Text>
          </View>
          {suggestionRows.length > 0 ? (
            <View className="gap-1">
              <Text variant="label">{t('m.vault.suggestions')}</Text>
              <RowGroup>
                {suggestionRows.map((row, i) => (
                  <View key={row.key}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow
                      title={row.display}
                      subtitle={row.label}
                      right={
                        row.applied ? (
                          <Text variant="caption">{t('m.vault.applied')}</Text>
                        ) : writable ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            title={t('m.vault.accept')}
                            accessibilityLabel={`${t('m.vault.accept')}: ${row.label} ${row.display}`}
                            onPress={row.apply}
                          />
                        ) : null
                      }
                    />
                  </View>
                ))}
              </RowGroup>
              {s?.holderName ? (
                <Text variant="caption">{t('m.vault.holderFound', { name: s.holderName })}</Text>
              ) : null}
            </View>
          ) : null}
          {writable && doc.fileIds.length > 0 && doc.ocrStatus !== 'pending' ? (
            <Button
              size="sm"
              variant="secondary"
              title={doc.ocrStatus === 'none' ? t('m.vault.runOcr') : t('m.vault.rerunOcr')}
              loading={runOcr.isPending}
              onPress={startOcr}
            />
          ) : null}
        </Card>
      )}

      {writable ? (
        <Button
          title={t('m.vault.delete')}
          variant="ghost"
          loading={remove.isPending}
          onPress={() => void confirmDelete()}
        />
      ) : null}
    </ScrollView>
  );
}
