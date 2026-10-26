import { LifeBuoy } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ModuleGate } from '@/components/gates';
import {
  Button,
  Card,
  ChipSelect,
  ErrorState,
  LoadingView,
  ScreenScroll,
  Text,
  TextField,
} from '@/components/ui';
import { useSupportAccess, useSupportAccessMutations } from '@/features/integrations/hooks';
import { useIntlLocale } from '@/i18n';
import { confirmAsync } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

const DURATIONS = ['1', '24', '72'] as const;
type Duration = (typeof DURATIONS)[number];

/** Grant or revoke time-limited access for the support team (owners/admins). */
export default function SupportAccessScreen() {
  return (
    <ModuleGate action="household.manage">
      <SupportAccess />
    </ModuleGate>
  );
}

function SupportAccess() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const now = useNow();
  const access = useSupportAccess();
  const { grant, revoke } = useSupportAccessMutations();
  const [hours, setHours] = useState<Duration>('24');
  const [reason, setReason] = useState('');

  if (access.isPending) return <LoadingView />;
  if (access.error && !access.data)
    return <ErrorState error={access.error} onRetry={() => void access.refetch()} />;

  const active =
    access.data.active &&
    (!access.data.expiresAt || new Date(access.data.expiresAt).getTime() > now.getTime());

  return (
    <ScreenScroll>
      <View className="items-center gap-2 py-2">
        <LifeBuoy size={36} color={colors.primary} />
        <Text variant="caption" className="text-center">
          {t('m.integrations.supportIntro')}
        </Text>
      </View>
      <Card>
        <Text
          variant="subheading"
          className={active ? 'text-success' : ''}
          accessibilityLiveRegion="polite"
        >
          {active && access.data.expiresAt
            ? t('m.integrations.supportActive', {
                date: new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(access.data.expiresAt)),
              })
            : t('m.integrations.supportInactive')}
        </Text>
        {active && access.data.reason ? <Text variant="caption">{access.data.reason}</Text> : null}
      </Card>
      {active ? (
        <Button
          variant="danger"
          title={t('m.integrations.revoke')}
          loading={revoke.isPending}
          onPress={() => {
            void confirmAsync(t('m.integrations.revokeTitle'), undefined, {
              confirmLabel: t('m.integrations.revoke'),
              cancelLabel: t('common.cancel'),
              destructive: true,
            }).then((ok) => {
              if (ok) revoke.mutate();
            });
          }}
        />
      ) : (
        <Card>
          <ChipSelect<Duration>
            label={t('m.integrations.supportDuration')}
            options={DURATIONS.map((h) => ({
              value: h,
              label: t('m.integrations.hours', { count: Number(h) }),
            }))}
            value={hours}
            onChange={setHours}
          />
          <TextField
            label={t('m.integrations.supportReason')}
            placeholder={t('m.integrations.supportReasonPlaceholder')}
            value={reason}
            onChangeText={setReason}
            maxLength={300}
          />
          <Button
            title={t('m.integrations.grant')}
            loading={grant.isPending}
            onPress={() => {
              grant.mutate({
                hours: Number(hours),
                ...(reason.trim() ? { reason: reason.trim() } : {}),
              });
            }}
          />
        </Card>
      )}
    </ScreenScroll>
  );
}
