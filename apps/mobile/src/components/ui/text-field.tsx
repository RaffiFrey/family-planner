import type { ComponentRef, Ref } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';
import { useColors } from '@/lib/theme';
import { Text } from './text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | undefined;
  hint?: string;
  className?: string;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

export function TextField({
  label,
  error,
  hint,
  className,
  multiline,
  ref,
  ...props
}: TextFieldProps) {
  const colors = useColors();
  return (
    <View className={`gap-1 ${className ?? ''}`}>
      {label ? <Text variant="label">{label}</Text> : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.textMuted}
        maxFontSizeMultiplier={2}
        multiline={multiline}
        className={`rounded-md border bg-background px-3 text-base text-text ${multiline ? 'min-h-24 py-3' : 'min-h-12 py-2'} ${error ? 'border-danger' : 'border-border'}`}
        style={multiline ? { textAlignVertical: 'top' } : undefined}
        {...props}
      />
      {error ? (
        <Text variant="caption" className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  );
}
