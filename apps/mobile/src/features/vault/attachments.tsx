import { apiQuery } from '@fp/api-client';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Camera, FileText, ImagePlus, Paperclip, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Button, Divider, IconButton, ListRow, RowGroup, Text } from '@/components/ui';
import {
  ensureRootFolder,
  type PickedFile,
  pickDocument,
  pickImage,
  uploadToStorage,
} from '@/features/files/file-transfer';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { notify, showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

function AttachmentThumb({ fileId }: { fileId: string }) {
  const { householdId } = useHousehold();
  const colors = useColors();
  const thumb = useQuery({
    ...apiQuery(api, 'storage', 'download', {
      params: { householdId, fileId },
      query: { thumbnail: 'true' },
    }),
    staleTime: 4 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
  if (thumb.data) {
    return (
      <Image
        source={{ uri: thumb.data.url }}
        style={{ width: 44, height: 44, borderRadius: 6 }}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return <FileText size={24} color={colors.textMuted} />;
}

/** Attached files of a document: open, detach, and add from camera, photos or files. */
export function Attachments({
  fileIds,
  writable,
  onAttached,
  onDetach,
}: {
  fileIds: readonly string[];
  writable: boolean;
  onAttached: (fileId: string) => Promise<void>;
  onDetach: (fileId: string) => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId } = useHousehold();
  const [uploading, setUploading] = useState(false);

  const open = async (fileId: string) => {
    try {
      const link = await api.storage.download({
        params: { householdId, fileId },
        query: { thumbnail: 'false' },
      });
      await WebBrowser.openBrowserAsync(link.url);
    } catch (e) {
      showError(e, t);
    }
  };

  const attach = async (pick: () => Promise<PickedFile | null>) => {
    let file: PickedFile | null;
    try {
      file = await pick();
    } catch {
      notify(t('m.vault.pickFailed'));
      return;
    }
    if (!file) return;
    setUploading(true);
    try {
      const folderId = await ensureRootFolder(householdId, t('m.vault.folderName'));
      const stored = await uploadToStorage(householdId, folderId, file);
      await onAttached(stored.id);
    } catch (e) {
      showError(e, t);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View className="gap-2">
      {fileIds.length > 0 ? (
        <RowGroup>
          {fileIds.map((id, i) => (
            <View key={id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={t('m.vault.attachmentN', { n: i + 1 })}
                subtitle={t('m.vault.openAttachment')}
                left={<AttachmentThumb fileId={id} />}
                onPress={() => void open(id)}
                right={
                  writable ? (
                    <IconButton
                      label={t('m.vault.detach')}
                      onPress={() => {
                        onDetach(id);
                      }}
                    >
                      <X size={20} color={colors.textMuted} />
                    </IconButton>
                  ) : null
                }
              />
            </View>
          ))}
        </RowGroup>
      ) : (
        <Text variant="caption">{t('m.vault.noAttachments')}</Text>
      )}
      {writable ? (
        uploading ? (
          <View
            className="flex-row items-center gap-2 py-2"
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('m.vault.uploading')}
          >
            <ActivityIndicator color={colors.primary} />
            <Text variant="caption">{t('m.vault.uploading')}</Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {Platform.OS !== 'web' ? (
              <Button
                size="sm"
                variant="secondary"
                title={t('m.vault.camera')}
                icon={<Camera size={16} color={colors.text} />}
                onPress={() => void attach(() => pickImage('camera'))}
              />
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              title={t('m.vault.photo')}
              icon={<ImagePlus size={16} color={colors.text} />}
              onPress={() => void attach(() => pickImage('library'))}
            />
            <Button
              size="sm"
              variant="secondary"
              title={t('m.vault.file')}
              icon={<Paperclip size={16} color={colors.text} />}
              onPress={() => void attach(pickDocument)}
            />
          </View>
        )
      ) : null}
    </View>
  );
}
