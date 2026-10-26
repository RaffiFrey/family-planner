import { useTranslation } from 'react-i18next';
import { TextField } from '@/components/ui';
import { useAmountFormat } from '@/features/finance/hooks';
import { parseMoneyText } from './money-text';

/** Amount text input (decimal keyboard); parse with `useParseMoney`. */
export function MoneyField({
  label,
  value,
  onChangeText,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string | undefined;
  hint?: string;
}) {
  const { t } = useTranslation();
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChangeText}
      keyboardType="decimal-pad"
      inputMode="decimal"
      placeholder={t('m.financePlus.amountPlaceholder')}
      error={error}
      {...(hint ? { hint } : {})}
    />
  );
}

/** Parser for MoneyField values in the household currency (positive minor units or null). */
export function useParseMoney(): (text: string) => number | null {
  const format = useAmountFormat();
  return (text) => parseMoneyText(text, format.exponent, format.style);
}
