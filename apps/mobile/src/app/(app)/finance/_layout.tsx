import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BiometricGate } from '@/features/settings/biometric-gate';
import { useColors } from '@/lib/theme';
import { modalPresentation } from '@/lib/stack-options';

export default function FinanceLayout() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <BiometricGate>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ title: t('nav.finance') }} />
        <Stack.Screen name="transactions" options={{ title: t('m.finance.transactions') }} />
        <Stack.Screen
          name="transaction"
          options={{ title: t('m.finance.newTransaction'), ...modalPresentation }}
        />
        <Stack.Screen name="contracts" options={{ title: t('m.financePlus.contracts') }} />
        <Stack.Screen
          name="contract-new"
          options={{ title: t('m.financePlus.newContract'), ...modalPresentation }}
        />
        <Stack.Screen name="goals" options={{ title: t('m.financePlus.goals') }} />
        <Stack.Screen name="goal" options={{ title: '' }} />
        <Stack.Screen
          name="goal-new"
          options={{ title: t('m.financePlus.newGoal'), ...modalPresentation }}
        />
        <Stack.Screen name="shared" options={{ title: t('m.financePlus.shared') }} />
        <Stack.Screen
          name="shared-expense"
          options={{ title: t('m.financePlus.newExpense'), ...modalPresentation }}
        />
        <Stack.Screen name="insurance" options={{ title: t('m.financePlus.insurance') }} />
        <Stack.Screen
          name="party"
          options={{ title: t('m.financePlus.editPerson'), ...modalPresentation }}
        />
        <Stack.Screen name="reports" options={{ title: t('m.financePlus.reports') }} />
        <Stack.Screen name="bank-sync" options={{ title: t('m.financePlus.bankSync') }} />
        <Stack.Screen
          name="bank-link"
          options={{ title: t('m.financePlus.linkAccount'), ...modalPresentation }}
        />
        <Stack.Screen name="budgets" options={{ title: t('m.finance.budgets') }} />
        <Stack.Screen
          name="account-new"
          options={{ title: t('m.finance.newAccount'), ...modalPresentation }}
        />
      </Stack>
    </BiometricGate>
  );
}
