import { apiQuery } from '@fp/api-client';
import type { Folder, StoredFile } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  File as FileIcon,
  FileText,
  Folder as FolderIcon,
  Plus,
  ShieldAlert,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, View } from 'react-native';
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
  Text,
  TextField,
} from '@/components/ui';
import {
  downloadAndShare,
  type PickedFile,
  pickDocument,
  pickImage,
  uploadToStorage,
} from '@/features/files/file-transfer';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useColors } from '@/lib/theme';

function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit] ?? 'B'}`;
}

function FileThumb({ file }: { file: StoredFile }) {
  const { householdId } = useHousehold();
  const colors = useColors();
  const thumb = useQuery({
    ...apiQuery(api, 'storage', 'download', {
      params: { householdId, fileId: file.id },
      query: { thumbnail: 'true' },
    }),
    enabled: file.hasThumbnail && file.status === 'ready',
    staleTime: 4 * 60_000,
    gcTime: 5 * 60_000,
  });
  if (file.status === 'infected') return <ShieldAlert size={24} color={colors.danger} />;
  if (thumb.data) {
    return (
      <Image
        source={{ uri: thumb.data.url }}
        style={{ width: 40, height: 40, borderRadius: 6 }}
        contentFit="cover"
      />
    );
  }
  return file.mimeType.startsWith('text/') || file.mimeType === 'application/pdf' ? (
    <FileText size={24} color={colors.textMuted} />
  ) : (
    <FileIcon size={24} color={colors.textMuted} />
  );
}

/** Folder browser: open folders, upload photos/documents, download and share files. */
export default function FilesScreen() {
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { householdId, can } = useHousehold();
  const queryClient = useQueryClient();
  const contents = useQuery(
    apiQuery(api, 'storage', 'browse', {
      params: { householdId },
      query: folderId ? { folderId } : {},
    }),
  );
  const usage = useQuery({
    ...apiQuery(api, 'storage', 'usage', { params: { householdId } }),
    enabled: !folderId,
  });
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const writable = can('storage.write');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['storage'] });
  const upload = useMutation({
    mutationFn: (file: PickedFile) => uploadToStorage(householdId, folderId ?? null, file),
    onSettled: invalidate,
    onError: (e) => {
      Alert.alert(t('m.files.uploadFailed'), errorMessage(e, t));
    },
  });
  const createFolder = useMutation({
    mutationFn: () =>
      api.storage.createFolder({
        params: { householdId },
        body: { name: folderName.trim(), parentId: folderId ?? null },
      }),
    onSuccess: () => {
      setFolderDialog(false);
      setFolderName('');
    },
    onSettled: invalidate,
    onError: (e) => {
      Alert.alert(t('common.unknownError'), errorMessage(e, t));
    },
  });
  const removeFile = useMutation({
    mutationFn: (fileId: string) => api.storage.deleteFile({ params: { householdId, fileId } }),
    onSettled: invalidate,
  });
  const removeFolder = useMutation({
    mutationFn: (id: string) => api.storage.deleteFolder({ params: { householdId, folderId: id } }),
    onSettled: invalidate,
  });

  const pickAndUpload = async (source: 'camera' | 'library' | 'document') => {
    try {
      const picked = source === 'document' ? await pickDocument() : await pickImage(source);
      if (picked) upload.mutate(picked);
    } catch (e) {
      Alert.alert(t('m.files.uploadFailed'), errorMessage(e, t));
    }
  };

  const showAddMenu = () => {
    Alert.alert(t('m.files.add'), undefined, [
      { text: t('m.files.camera'), onPress: () => void pickAndUpload('camera') },
      { text: t('m.files.photo'), onPress: () => void pickAndUpload('library') },
      { text: t('m.files.document'), onPress: () => void pickAndUpload('document') },
      {
        text: t('m.files.newFolder'),
        onPress: () => {
          setFolderDialog(true);
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const openFile = async (file: StoredFile) => {
    if (file.status !== 'ready') {
      Alert.alert(file.name, t(`m.files.status.${file.status}`));
      return;
    }
    setBusyFile(file.id);
    try {
      await downloadAndShare(householdId, file);
    } catch (e) {
      Alert.alert(t('m.files.downloadFailed'), errorMessage(e, t));
    } finally {
      setBusyFile(null);
    }
  };

  const confirmDelete = (kind: 'file' | 'folder', item: StoredFile | Folder) => {
    if (!writable) return;
    Alert.alert(
      kind === 'folder' ? t('m.files.deleteFolder') : t('m.files.deleteFile'),
      item.name,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            if (kind === 'folder') removeFolder.mutate(item.id);
            else removeFile.mutate(item.id);
          },
        },
      ],
    );
  };

  const title = contents.data?.folder?.name ?? t('nav.storage');
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title,
          headerRight: writable
            ? () => (
                <IconButton label={t('m.files.add')} onPress={showAddMenu}>
                  <Plus size={24} color={colors.text} />
                </IconButton>
              )
            : undefined,
        }}
      />
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-12"
        refreshControl={
          <RefreshControl
            refreshing={contents.isRefetching}
            onRefresh={() => void contents.refetch()}
          />
        }
      >
        {usage.data ? (
          <Card>
            <Text variant="caption">
              {t('m.files.usage', {
                used: formatBytes(usage.data.usedBytes, locale),
                quota: formatBytes(usage.data.quotaBytes, locale),
              })}
            </Text>
            <ProgressBar
              ratio={usage.data.quotaBytes > 0 ? usage.data.usedBytes / usage.data.quotaBytes : 0}
              tone={
                usage.data.usedBytes / Math.max(1, usage.data.quotaBytes) > 0.9
                  ? 'warning'
                  : 'primary'
              }
              label={t('m.files.storageUsage')}
            />
          </Card>
        ) : null}
        {contents.data && contents.data.breadcrumbs.length > 0 ? (
          <Text variant="caption" numberOfLines={1}>
            {[t('nav.storage'), ...contents.data.breadcrumbs.map((b) => b.name)].join(' / ')}
          </Text>
        ) : null}
        {upload.isPending ? (
          <Card className="flex-row items-center gap-3">
            <ActivityIndicator color={colors.primary} />
            <Text>{t('m.files.uploading')}</Text>
          </Card>
        ) : null}
        {contents.isPending ? (
          <LoadingView />
        ) : contents.error && !contents.data ? (
          <ErrorState error={contents.error} onRetry={() => void contents.refetch()} />
        ) : contents.data.folders.length + contents.data.files.length === 0 ? (
          <EmptyState
            title={t('m.files.empty')}
            action={
              writable ? (
                <Button title={t('m.files.add')} variant="secondary" onPress={showAddMenu} />
              ) : undefined
            }
          />
        ) : (
          <RowGroup>
            {contents.data.folders.map((f, i) => (
              <View key={f.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={f.name}
                  left={<FolderIcon size={24} color={colors.primary} />}
                  chevron
                  onPress={() => {
                    router.push({ pathname: '/files', params: { folderId: f.id } });
                  }}
                  onLongPress={() => {
                    confirmDelete('folder', f);
                  }}
                />
              </View>
            ))}
            {contents.data.files.map((f, i) => (
              <View key={f.id}>
                {i > 0 || contents.data.folders.length > 0 ? <Divider /> : null}
                <ListRow
                  title={f.name}
                  subtitle={`${formatBytes(f.sizeBytes, locale)} · ${dateFmt.format(new Date(f.createdAt))}${f.status === 'ready' ? '' : ` · ${t(`m.files.status.${f.status}`)}`}`}
                  left={<FileThumb file={f} />}
                  right={busyFile === f.id ? <ActivityIndicator color={colors.primary} /> : null}
                  accessibilityHint={t('m.files.openHint')}
                  onPress={() => void openFile(f)}
                  onLongPress={() => {
                    confirmDelete('file', f);
                  }}
                />
              </View>
            ))}
          </RowGroup>
        )}
      </ScrollView>
      <Modal
        visible={folderDialog}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setFolderDialog(false);
        }}
      >
        <View className="flex-1 justify-center bg-black/50 p-6">
          <View className="gap-4 rounded-lg bg-background p-4" accessibilityViewIsModal>
            <Text variant="heading">{t('m.files.newFolder')}</Text>
            <TextField
              label={t('common.name')}
              value={folderName}
              onChangeText={setFolderName}
              autoFocus
            />
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                variant="secondary"
                title={t('common.cancel')}
                onPress={() => {
                  setFolderDialog(false);
                }}
              />
              <Button
                className="flex-1"
                title={t('common.create')}
                disabled={folderName.trim() === ''}
                loading={createFolder.isPending}
                onPress={() => {
                  createFolder.mutate();
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
