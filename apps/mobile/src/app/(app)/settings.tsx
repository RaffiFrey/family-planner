import { useMutation } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { CalendarSync, LifeBuoy } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  Button,
  Card,
  Divider,
  ListRow,
  RowGroup,
  ScreenScroll,
  SectionHeader,
  Segmented,
  SwitchRow,
  Text,
} from '@/components/ui';
import { signOut } from '@/features/auth/sign-out';
import { useHousehold } from '@/features/household/household';
import { authenticate, biometricsAvailable } from '@/features/settings/biometric-gate';
import {
  type LocalePreference,
  type ThemePreference,
  useSettings,
} from '@/features/settings/settings-store';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import { confirmAsync, notify, showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const settings = useSettings();
  const colors = useColors();
  const { can } = useHousehold();

  const updateLocale = useMutation({
    mutationFn: (locale: 'de' | 'en') => api.households.updateMe({ body: { locale } }),
  });
  const exportData = useMutation({
    mutationFn: () => api.households.exportMyData(),
    onSuccess: () => {
      notify(t('m.settings.exportRequested'));
    },
    onError: (e) => {
      showError(e, t);
    },
  });
  const deleteAccount = useMutation({
    mutationFn: () => api.households.deleteMe(),
    onSuccess: async () => {
      await signOut();
    },
    onError: (e) => {
      showError(e, t);
    },
  });

  const onLocale = (locale: LocalePreference) => {
    settings.setLocale(locale);
    // Server-side texts (push, email) follow the profile language.
    if (locale !== 'system') updateLocale.mutate(locale);
  };

  const onBiometric = async (on: boolean) => {
    if (!on) {
      settings.setBiometricLock(false);
      return;
    }
    if (!(await biometricsAvailable())) {
      notify(t('m.settings.biometricUnavailable'));
      return;
    }
    if (await authenticate(t('m.settings.biometricEnable'))) settings.setBiometricLock(true);
  };

  const confirmDelete = () => {
    void confirmAsync(t('m.settings.deleteAccount'), t('m.settings.deleteAccountMessage'), {
      confirmLabel: t('m.settings.deleteAccountConfirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    }).then((ok) => {
      if (ok) deleteAccount.mutate();
    });
  };

  return (
    <ScreenScroll>
      <SectionHeader title={t('m.settings.language')} />
      <Segmented<LocalePreference>
        label={t('m.settings.language')}
        options={[
          { value: 'system', label: t('m.settings.system') },
          { value: 'de', label: 'Deutsch' },
          { value: 'en', label: 'English' },
        ]}
        value={settings.locale}
        onChange={onLocale}
      />
      <SectionHeader title={t('m.settings.theme')} />
      <Segmented<ThemePreference>
        label={t('m.settings.theme')}
        options={[
          { value: 'system', label: t('m.settings.system') },
          { value: 'light', label: t('m.settings.light') },
          { value: 'dark', label: t('m.settings.dark') },
        ]}
        value={settings.theme}
        onChange={settings.setTheme}
      />
      <SectionHeader title={t('m.settings.security')} />
      <RowGroup>
        <SwitchRow
          title={t('m.settings.biometricLock')}
          subtitle={t('m.settings.biometricLockHint')}
          value={settings.biometricLock}
          onValueChange={(v) => void onBiometric(v)}
        />
      </RowGroup>
      <SectionHeader title={t('m.integrations.section')} />
      <RowGroup>
        <ListRow
          title={t('m.integrations.calendarSync')}
          subtitle={t('m.integrations.calendarSyncHint')}
          left={<CalendarSync size={22} color={colors.primary} />}
          chevron
          onPress={() => {
            router.push('/integrations/calendar-sync');
          }}
        />
        {can('household.manage') ? (
          <>
            <Divider />
            <ListRow
              title={t('m.integrations.supportAccess')}
              subtitle={t('m.integrations.supportAccessHint')}
              left={<LifeBuoy size={22} color={colors.primary} />}
              chevron
              onPress={() => {
                router.push('/integrations/support');
              }}
            />
          </>
        ) : null}
      </RowGroup>
      <SectionHeader title={t('m.settings.account')} />
      <View className="gap-2">
        <Button
          variant="secondary"
          title={t('m.settings.exportData')}
          loading={exportData.isPending}
          onPress={() => {
            exportData.mutate();
          }}
        />
        <Button variant="secondary" title={t('common.signOut')} onPress={() => void signOut()} />
        <Button
          variant="danger"
          title={t('m.settings.deleteAccount')}
          loading={deleteAccount.isPending}
          onPress={confirmDelete}
        />
      </View>
      <Card>
        <Text variant="caption">
          {t('common.appName')} {Constants.expoConfig?.version ?? ''}
        </Text>
        <Divider />
        <Text variant="caption" selectable>
          {API_URL}
        </Text>
      </Card>
    </ScreenScroll>
  );
}
