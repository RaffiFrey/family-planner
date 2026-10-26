import { apiQuery } from '@fp/api-client';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { FileText } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import { Text } from '@/components/ui';
import { downloadAndShare } from '@/features/files/file-transfer';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

/** One attachment of a post: thumbnail for images, a file chip otherwise; tap to open. */
function AttachmentItem({ fileId }: { fileId: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId } = useHousehold();
  const meta = useQuery({
    ...apiQuery(api, 'storage', 'getFile', { params: { householdId, fileId } }),
    staleTime: 10 * 60_000,
  });
  const file = meta.data;
  const thumb = useQuery({
    ...apiQuery(api, 'storage', 'download', {
      params: { householdId, fileId },
      query: { thumbnail: 'true' },
    }),
    enabled: !!file && file.status === 'ready' && isImage(file.mimeType) && file.hasThumbnail,
    // Download links are short-lived.
    staleTime: 4 * 60_000,
    gcTime: 5 * 60_000,
  });
  if (!file) return null;

  const open = async () => {
    try {
      if (Platform.OS === 'web') {
        const link = await api.storage.download({ params: { householdId, fileId } });
        await WebBrowser.openBrowserAsync(link.url);
      } else await downloadAndShare(householdId, file);
    } catch (e) {
      showError(e, t);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('m.pinboard.openAttachment', { name: file.name })}
      onPress={() => void open()}
      className="overflow-hidden rounded-md border border-border"
    >
      {thumb.data ? (
        <Image
          source={{ uri: thumb.data.url }}
          style={{ width: 96, height: 96 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View className="max-w-48 flex-row items-center gap-2 px-3 py-2">
          <FileText size={18} color={colors.textMuted} />
          <Text variant="caption" numberOfLines={1}>
            {file.name}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function PostAttachments({ fileIds }: { fileIds: readonly string[] }) {
  if (fileIds.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {fileIds.map((id) => (
        <AttachmentItem key={id} fileId={id} />
      ))}
    </View>
  );
}
