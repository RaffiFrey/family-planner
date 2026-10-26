import { Delete } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import {
  type AmountFormat,
  applyKeypadKey,
  decimalSeparator,
  type KeypadKey,
} from './amount-input';

const ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['decimal', '0', 'backspace'],
];

/** Numeric keypad for money input; the value never passes through a float. */
export function AmountKeypad({
  value,
  onChange,
  format,
}: {
  value: string;
  onChange: (v: string) => void;
  format: AmountFormat;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <View className="gap-2">
      {ROWS.map((row) => (
        <View key={row.join('')} className="flex-row gap-2">
          {row.map((key) => {
            const label =
              key === 'decimal'
                ? decimalSeparator(format.style)
                : key === 'backspace'
                  ? t('m.finance.backspace')
                  : key;
            return (
              <Pressable
                key={key}
                accessibilityRole="keyboardkey"
                accessibilityLabel={label}
                onPress={() => {
                  onChange(applyKeypadKey(value, key, format));
                }}
                onLongPress={
                  key === 'backspace'
                    ? () => {
                        onChange(applyKeypadKey(value, 'clear', format));
                      }
                    : undefined
                }
                disabled={key === 'decimal' && format.exponent === 0}
                className="h-14 flex-1 items-center justify-center rounded-md bg-surface-muted active:bg-border"
              >
                {key === 'backspace' ? (
                  <Delete size={24} color={colors.text} />
                ) : (
                  <Text className="text-2xl font-medium" maxFontSizeMultiplier={1.3}>
                    {label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
