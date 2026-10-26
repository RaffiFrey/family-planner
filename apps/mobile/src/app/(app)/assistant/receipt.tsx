import type { Output } from '@fp/api-client';
import { isCurrencyCode } from '@fp/domain/money';
import { useMutation } from '@tanstack/react-query';
import { Camera, ImageUp } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { UpsellState } from '@/components/gates';
import { Button, Card, ScreenScroll, Text } from '@/components/ui';
import { AssistantGate } from '@/features/assistant/assistant-gate';
import { assistantErrorMessage, isFileNotReady } from '@/features/assistant/errors';
import { ProposalCard } from '@/features/assistant/proposal-card';
import { pickImage } from '@/features/files/file-transfer';
import { useMoney } from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household';
import { uploadAndWait } from '@/features/photos/upload';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { isPlanLimit } from '@/lib/errors';
import { useColors } from '@/lib/theme';

export default function ReceiptScreen() {
  return (
    <AssistantGate>
      <ReceiptScan />
    </AssistantGate>
  );
}

type ScanResult = Output<'assistant', 'receipt'>;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Camera → upload to "Belege" → assistant reads the receipt → confirm creates the transaction. */
function ReceiptScan() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const fmt = useMoney();
  const { householdId, household } = useHousehold();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [step, setStep] = useState<'idle' | 'uploading' | 'reading'>('idle');

  const scan = useMutation({
    mutationFn: async (source: 'camera' | 'library') => {
      const picked = await pickImage(source);
      if (!picked) return null;
      setStep('uploading');
      const file = await uploadAndWait(householdId, t('m.finance.receiptsFolder'), picked);
      if (!file) throw new Error(t('m.assistant.errors.fileNotReady'));
      setStep('reading');
      // The virus scan may still be finishing on the server: retry briefly.
      for (let attempt = 0; ; attempt++) {
        try {
          return await api.assistant.receipt({
            params: { householdId },
            body: { fileId: file.id },
          });
        } catch (e) {
          if (!isFileNotReady(e) || attempt >= 5) throw e;
          await sleep(1500);
        }
      }
    },
    onSuccess: (r) => {
      if (r) setResult(r);
    },
    onSettled: () => {
      setStep('idle');
    },
  });

  const busy = scan.isPending;
  const receipt = result?.receipt;
  const currency =
    receipt && isCurrencyCode(receipt.currency) ? receipt.currency : household.currency;

  return (
    <ScreenScroll>
      <Text variant="caption">{t('m.assistant.receiptIntro')}</Text>
      <View className="flex-row gap-2">
        {Platform.OS !== 'web' ? (
          <Button
            className="flex-1"
            title={t('m.files.camera')}
            icon={<Camera size={18} color={colors.primaryText} />}
            disabled={busy}
            onPress={() => {
              setResult(null);
              scan.mutate('camera');
            }}
          />
        ) : null}
        <Button
          className="flex-1"
          variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
          title={t('m.files.photo')}
          icon={
            <ImageUp size={18} color={Platform.OS === 'web' ? colors.primaryText : colors.text} />
          }
          disabled={busy}
          onPress={() => {
            setResult(null);
            scan.mutate('library');
          }}
        />
      </View>
      {busy ? (
        <Text accessibilityLiveRegion="polite">
          {step === 'reading' ? t('m.assistant.reading') : t('m.files.uploading')}
        </Text>
      ) : null}
      {scan.error ? (
        isPlanLimit(scan.error) ? (
          <UpsellState feature="ai_assistant" compact />
        ) : (
          <Text className="text-danger" accessibilityLiveRegion="polite">
            {assistantErrorMessage(scan.error, t)}
          </Text>
        )
      ) : null}

      {receipt ? (
        <Card>
          <Text variant="subheading">{receipt.merchant ?? t('m.assistant.unknownMerchant')}</Text>
          <Text variant="caption">
            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
              new Date(`${receipt.date}T12:00:00`),
            )}
          </Text>
          {receipt.lineItems.map((li, i) => (
            <View key={`${i}-${li.description}`} className="flex-row justify-between gap-2">
              <Text className="flex-1" numberOfLines={2}>
                {li.quantity && li.quantity !== 1 ? `${li.quantity} × ` : ''}
                {li.description}
              </Text>
              <Text>{fmt(li.amountMinor, currency)}</Text>
            </View>
          ))}
          <View className="flex-row justify-between border-t border-border pt-2">
            <Text className="font-semibold">{t('m.assistant.total')}</Text>
            <Text className="font-semibold">{fmt(receipt.totalMinor, currency)}</Text>
          </View>
          {result.warnings.map((w) => (
            <Text key={w} variant="caption" className="text-warning">
              {w}
            </Text>
          ))}
        </Card>
      ) : null}

      {result ? (
        <ProposalCard
          key={result.proposal.id}
          proposal={result.proposal}
          onApplied={(p) => {
            setResult({ ...result, proposal: p });
          }}
          onDiscarded={() => {
            setResult(null);
          }}
        />
      ) : null}
    </ScreenScroll>
  );
}
