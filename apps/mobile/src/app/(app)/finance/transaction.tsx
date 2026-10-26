import type { Transaction } from '@fp/contracts';
import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Camera, Image as ImageIcon, Paperclip, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  Button,
  ChipSelect,
  DateField,
  EmptyState,
  IconButton,
  LoadingView,
  ScreenScroll,
  Segmented,
  Text,
  TextField,
} from '@/components/ui';
import { dayKey, parseDayKey } from '@/features/calendar/dates';
import {
  ensureRootFolder,
  type PickedFile,
  pickImage,
  uploadToStorage,
} from '@/features/files/file-transfer';
import {
  amountInputToMinor,
  type Direction,
  minorToAmountInput,
} from '@/features/finance/amount-input';
import { AmountKeypad } from '@/features/finance/amount-keypad';
import {
  useAccounts,
  useAmountFormat,
  useCategories,
  useCategoryLabels,
  useMoney,
} from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { errorMessage, FormError } from '@/lib/errors';
import { useColors } from '@/lib/theme';

type TxPage = { items: Transaction[]; nextCursor: string | null };

function useCachedTransaction(id: string | undefined): Transaction | undefined {
  const queryClient = useQueryClient();
  if (!id) return undefined;
  for (const [, data] of queryClient.getQueriesData<InfiniteData<TxPage>>({
    queryKey: ['finance', 'listTransactions'],
  })) {
    const found = data?.pages.flatMap((p) => p.items).find((tx) => tx.id === id);
    if (found) return found;
  }
  return undefined;
}

export default function TransactionScreen() {
  const { id, accountId } = useLocalSearchParams<{ id?: string; accountId?: string }>();
  const existing = useCachedTransaction(id);
  const accounts = useAccounts();
  const { t } = useTranslation();
  if (id && !existing) return <EmptyState title={t('errors.notFound')} />;
  if (!accounts.data) return <LoadingView />;
  return (
    <TransactionForm
      key={existing?.id ?? 'new'}
      transaction={existing}
      accounts={accounts.data}
      defaultAccountId={accountId ?? accounts.data.find((a) => !a.archived)?.id}
    />
  );
}

function TransactionForm({
  transaction,
  accounts,
  defaultAccountId,
}: {
  transaction: Transaction | undefined;
  accounts: {
    id: string;
    name: string;
    archived: boolean;
    color: string | null;
    currency: Transaction['currency'];
  }[];
  defaultAccountId: string | undefined;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const labels = useCategoryLabels();
  const fmt = useMoney();
  const [accountId, setAccountId] = useState<string | null>(
    transaction?.accountId ?? defaultAccountId ?? null,
  );
  const account = accounts.find((a) => a.id === accountId);
  const format = useAmountFormat(account?.currency);
  const [direction, setDirection] = useState<Direction>(
    transaction && transaction.amountMinor > 0 ? 'income' : 'expense',
  );
  const [amount, setAmount] = useState(
    transaction ? minorToAmountInput(transaction.amountMinor, format) : '',
  );
  const [date, setDate] = useState<Date>(
    transaction ? parseDayKey(transaction.bookingDate) : new Date(),
  );
  const [counterparty, setCounterparty] = useState(transaction?.counterpartyName ?? '');
  const [purpose, setPurpose] = useState(transaction?.purpose ?? '');
  const [categoryId, setCategoryId] = useState<string>(transaction?.categoryId ?? 'none');
  const [notes, setNotes] = useState(transaction?.notes ?? '');
  const [receipt, setReceipt] = useState<PickedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountMinor = amountInputToMinor(amount, direction, format);
  const kind = direction === 'income' ? 'income' : 'expense';
  const categoryOptions = [
    { value: 'none', label: t('categories.uncategorized') },
    ...(categories.data ?? [])
      .filter((c) => !c.hidden && c.kind === kind)
      .map((c) => ({ value: c.id, label: labels.get(c.id) ?? c.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  const save = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new FormError(t('m.finance.chooseAccount'));
      if (amountMinor === null) throw new FormError(t('m.finance.enterAmount'));
      const bookingDate = dayKey(date);
      let noteText = notes.trim();
      if (receipt) {
        const folderId = await ensureRootFolder(householdId, t('m.finance.receiptsFolder'));
        const ext = receipt.name.includes('.')
          ? receipt.name.slice(receipt.name.lastIndexOf('.'))
          : '.jpg';
        const name = `${bookingDate} ${counterparty.trim() || t('m.finance.receipt')}${ext}`;
        const stored = await uploadToStorage(householdId, folderId, { ...receipt, name });
        noteText = [noteText, t('m.finance.receiptNote', { name: stored.name })]
          .filter(Boolean)
          .join('\n');
      }
      const fields = {
        bookingDate,
        amountMinor,
        counterpartyName: counterparty.trim() || null,
        purpose: purpose.trim(),
        categoryId: categoryId === 'none' ? null : categoryId,
        notes: noteText || null,
      };
      return transaction
        ? api.finance.updateTransaction({
            params: { householdId, transactionId: transaction.id },
            body: fields,
          })
        : api.finance.createTransaction({
            params: { householdId },
            body: { ...fields, accountId },
          });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finance'] });
      if (receipt) await queryClient.invalidateQueries({ queryKey: ['storage'] });
      router.back();
    },
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  const attach = async (source: 'camera' | 'library') => {
    try {
      const picked = await pickImage(source);
      if (picked) setReceipt(picked);
    } catch (e) {
      setError(errorMessage(e, t));
    }
  };

  return (
    <ScreenScroll>
      <Stack.Screen
        options={{
          title: transaction ? t('m.finance.editTransaction') : t('m.finance.newTransaction'),
        }}
      />
      {!transaction ? (
        <ChipSelect
          label={t('m.finance.account')}
          options={accounts
            .filter((a) => !a.archived)
            .map((a) => ({ value: a.id, label: a.name, ...(a.color ? { color: a.color } : {}) }))}
          value={accountId}
          onChange={setAccountId}
          scroll
        />
      ) : null}
      <Segmented
        label={t('m.finance.direction')}
        options={[
          { value: 'expense', label: t('m.finance.expense') },
          { value: 'income', label: t('m.finance.incomeOne') },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <View
        className="items-center py-2"
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
      >
        <Text
          className={`text-4xl font-bold ${direction === 'income' ? 'text-success' : 'text-text'}`}
          maxFontSizeMultiplier={1.5}
          accessibilityLabel={t('m.finance.amount')}
        >
          {amountMinor !== null ? fmt(amountMinor, account?.currency) : fmt(0, account?.currency)}
        </Text>
      </View>
      <AmountKeypad value={amount} onChange={setAmount} format={format} />
      <DateField
        label={t('m.finance.date')}
        value={date}
        onChange={(d) => {
          if (d) setDate(d);
        }}
      />
      <TextField
        label={t('m.finance.counterparty')}
        value={counterparty}
        onChangeText={setCounterparty}
      />
      <TextField label={t('m.finance.purpose')} value={purpose} onChangeText={setPurpose} />
      <ChipSelect
        label={t('m.finance.category')}
        options={categoryOptions}
        value={categoryId}
        onChange={setCategoryId}
      />
      <TextField label={t('m.finance.notes')} value={notes} onChangeText={setNotes} multiline />
      <View className="gap-2">
        <Text variant="label">{t('m.finance.receipt')}</Text>
        {receipt ? (
          <View className="flex-row items-center gap-2 rounded-md border border-border p-3">
            <Paperclip size={18} color={colors.textMuted} />
            <Text className="flex-1" numberOfLines={1}>
              {receipt.name}
            </Text>
            <IconButton
              label={t('m.common.clear')}
              onPress={() => {
                setReceipt(null);
              }}
            >
              <X size={18} color={colors.textMuted} />
            </IconButton>
          </View>
        ) : (
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              variant="secondary"
              size="sm"
              title={t('m.files.camera')}
              icon={<Camera size={16} color={colors.text} />}
              onPress={() => void attach('camera')}
            />
            <Button
              className="flex-1"
              variant="secondary"
              size="sm"
              title={t('m.files.photo')}
              icon={<ImageIcon size={16} color={colors.text} />}
              onPress={() => void attach('library')}
            />
          </View>
        )}
      </View>
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        title={t('common.save')}
        disabled={amountMinor === null || !accountId}
        loading={save.isPending}
        onPress={() => {
          setError(null);
          save.mutate();
        }}
      />
    </ScreenScroll>
  );
}
