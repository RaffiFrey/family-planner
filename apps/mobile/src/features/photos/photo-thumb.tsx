import { Image } from 'expo-image';
import { Film, ImageOff } from 'lucide-react-native';
import { ActivityIndicator, View } from 'react-native';
import { useColors } from '@/lib/theme';
import { useFileUrl } from './hooks';

/** Square photo thumbnail loaded through a signed storage URL. */
export function PhotoThumb({
  fileId,
  mimeType,
  alt,
  size,
  variant = 'thumb',
}: {
  fileId: string | null;
  mimeType?: string;
  alt: string;
  size?: number;
  variant?: 'thumb' | 'full';
}) {
  const colors = useColors();
  const isVideo = mimeType?.startsWith('video/') ?? false;
  const url = useFileUrl(fileId, variant);
  const style = size ? { width: size, height: size } : { width: '100%' as const, aspectRatio: 1 };
  if (fileId === null || url.isError || (isVideo && !url.data)) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={alt}
        className="items-center justify-center rounded-md bg-surface-muted"
        style={style}
      >
        {isVideo ? (
          <Film size={24} color={colors.textMuted} />
        ) : (
          <ImageOff size={24} color={colors.textMuted} />
        )}
      </View>
    );
  }
  if (!url.data) {
    return (
      <View className="items-center justify-center rounded-md bg-surface-muted" style={style}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url.data }}
      accessibilityLabel={alt}
      contentFit={variant === 'full' ? 'contain' : 'cover'}
      transition={150}
      style={[style, { borderRadius: 8 }]}
    />
  );
}
