import { Pressable, ScrollView, View } from 'react-native';
import { Text } from './text';

export interface Option<T extends string> {
  value: T;
  label: string;
  color?: string;
}

export function Chip({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string | undefined;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className={`min-h-9 flex-row items-center gap-2 rounded-full border px-3 py-1.5 ${selected ? 'border-primary bg-primary' : 'border-border bg-surface'}`}
    >
      {color ? <View className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} /> : null}
      <Text className={`text-sm ${selected ? 'text-primary-text' : 'text-text'}`}>{label}</Text>
    </Pressable>
  );
}

/** Single-choice chips that wrap onto several lines (or scroll horizontally). */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  label,
  scroll,
}: {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (v: T) => void;
  label?: string;
  scroll?: boolean;
}) {
  const chips = options.map((o) => (
    <Chip
      key={o.value}
      label={o.label}
      color={o.color}
      selected={o.value === value}
      onPress={() => {
        onChange(o.value);
      }}
    />
  ));
  return (
    <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={label}>
      {label ? <Text variant="label">{label}</Text> : null}
      {scroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {chips}
        </ScrollView>
      ) : (
        <View className="flex-row flex-wrap gap-2">{chips}</View>
      )}
    </View>
  );
}

/** Multi-choice chips. */
export function ChipMultiSelect<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly Option<T>[];
  value: readonly T[];
  onChange: (v: T[]) => void;
  label?: string;
}) {
  return (
    <View className="gap-2" accessibilityLabel={label}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const selected = value.includes(o.value);
          return (
            <Chip
              key={o.value}
              label={o.label}
              color={o.color}
              selected={selected}
              onPress={() => {
                onChange(selected ? value.filter((v) => v !== o.value) : [...value, o.value]);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

/** Segmented control for 2-4 options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <View
      className="flex-row rounded-md bg-surface-muted p-1"
      accessibilityRole="tablist"
      accessibilityLabel={label}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              onChange(o.value);
            }}
            className={`min-h-10 flex-1 items-center justify-center rounded px-2 ${selected ? 'bg-background' : ''}`}
          >
            <Text
              className={`text-sm ${selected ? 'font-semibold text-text' : 'text-muted'}`}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
