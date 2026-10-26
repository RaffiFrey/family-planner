import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ChipSelect, ScreenScroll, Text, TextField } from '@/components/ui';
import { useAccounts } from '@/features/finance/hooks';
import { useBankConnections, useFinancePlusMutation } from '@/features/finance-plus/hooks';
import { api } from '@/lib/api';

/** Sync a bank account into an existing account or a new one. */
export default function BankLinkScreen() {
  const { connectionId, bankAccountId } = useLocalSearchParams<{
    connectionId: string;
    bankAccountId: string;
  }>();
  const { t } = useTranslation();
  const accounts = useAccounts();
  const connections = useBankConnections();
  const bankAccount = connections.data
    ?.find((c) => c.id === connectionId)
    ?.accounts.find((a) => a.id === bankAccountId);
  const [target, setTarget] = useState<string>('new');
  const [name, setName] = useState<string | null>(null);

  const link = useFinancePlusMutation(
    (householdId, body: { accountId: string | null; name?: string }) =>
      api.financePlus.linkBankAccount({
        params: { householdId, connectionId, bankAccountId },
        body,
      }),
    () => {
      router.back();
    },
  );

  const newName = name ?? bankAccount?.name ?? '';

  return (
    <ScreenScroll>
      {bankAccount ? <Text variant="subheading">{bankAccount.name}</Text> : null}
      <Text variant="caption">{t('m.financePlus.linkHint')}</Text>
      <ChipSelect
        label={t('m.financePlus.linkTarget')}
        value={target}
        onChange={setTarget}
        options={[
          { value: 'new', label: t('m.financePlus.newAccount') },
          ...(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name })),
        ]}
      />
      {target === 'new' ? (
        <TextField label={t('common.name')} value={newName} onChangeText={setName} />
      ) : null}
      <Button
        title={t('m.financePlus.link')}
        loading={link.isPending}
        onPress={() => {
          link.mutate(
            target === 'new'
              ? { accountId: null, ...(newName.trim() ? { name: newName.trim() } : {}) }
              : { accountId: target },
          );
        }}
      />
    </ScreenScroll>
  );
}
