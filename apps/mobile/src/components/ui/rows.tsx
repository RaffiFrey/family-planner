import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useColors } from '@/lib/theme';
import { Text } from './text';

export interface ListRowProps {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  accessibilityHint?: string;
  destructive?: boolean;
}

export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  onLongPress,
  chevron,
  accessibilityHint,
  destructive,
}: ListRowProps) {
  const colors = useColors();
  const content = (
    <>
      {left}
      <View className="flex-1 gap-0.5">
        <Text className={destructive ? 'text-danger' : ''} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <ChevronRight size={20} color={colors.textMuted} /> : null}
    </>
  );
  if (!onPress && !onLongPress) {
    return <View className="min-h-14 flex-row items-center gap-3 px-4 py-3">{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onLongPress={onLongPress}
      className="min-h-14 flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted"
    >
      {content}
    </Pressable>
  );
}

export function RowGroup({ children }: { children: ReactNode }) {
  return (
    <View className="overflow-hidden rounded-lg border border-border bg-surface">{children}</View>
  );
}

export function Divider() {
  return <View className="ml-4 h-px bg-border" />;
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <View className="min-h-14 flex-row items-center gap-3 px-4 py-3">
      <View className="flex-1 gap-0.5">
        <Text>{title}</Text>
        {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}
