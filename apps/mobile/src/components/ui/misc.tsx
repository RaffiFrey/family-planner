import { Plus, WifiOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnectivity } from '@/lib/connectivity';
import { useColors } from '@/lib/theme';
import { Text } from './text';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <View
      accessible
      accessibilityLabel={name}
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <Text
        className="font-semibold text-white"
        style={{ fontSize: size * 0.38 }}
        maxFontSizeMultiplier={1.2}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

/** Floating "add" button in the bottom right corner. */
export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-80"
    >
      <Plus size={28} color={colors.primaryText} />
    </Pressable>
  );
}

/** Floating notice above the tab bar while the API is unreachable (cached data stays usable). */
export function OfflineBanner() {
  const online = useConnectivity((s) => s.online);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      className="absolute left-4 right-4 z-50 flex-row items-center gap-2 rounded-lg bg-warning px-4 py-2 shadow-md"
      style={{ bottom: insets.bottom + 64 }}
    >
      <WifiOff size={16} color="#ffffff" />
      <Text className="flex-1 text-sm text-white">{t('common.offline')}</Text>
    </View>
  );
}

/** Small colored dot, e.g. for calendar or member colors. */
export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
  );
}
