import type { Contact } from '@fp/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CloudOff, Pencil, ShieldPlus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
} from '@/components/ui';
import { CallButton } from '@/features/contacts/call-button';
import { useEmergencySummary } from '@/features/contacts/hooks';
import { isStale } from '@/features/contacts/offline-store';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';

export default function EmergencyCardScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { can } = useHousehold();
  const summary = useEmergencySummary(memberId);

  if (summary.isPending) return <LoadingView />;
  if (summary.error && !summary.data)
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;

  const { summary: s, savedAt, source } = summary.data;
  const card = s.card;
  const stand = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(savedAt),
  );
  const stale = isStale(summary.data);
  const writable = can('contacts.write');
  const editCard = () => {
    router.push({ pathname: '/contacts/emergency-edit', params: { memberId } });
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={summary.isRefetching}
          onRefresh={() => void summary.refetch()}
        />
      }
    >
      <Stack.Screen
        options={{
          title: t('m.contacts.emergencyCard'),
          headerRight: () =>
            writable ? (
              <IconButton label={t('m.contacts.editEmergencyCard')} onPress={editCard}>
                <Pencil size={20} color={colors.text} />
              </IconButton>
            ) : null,
        }}
      />
      <View className="flex-row items-center gap-3">
        <Avatar name={s.member.displayName} color={s.member.color} size={56} />
        <View className="flex-1 gap-0.5">
          <Text variant="heading">{s.member.displayName}</Text>
          {s.member.birthday ? (
            <Text variant="caption">
              {t('m.contacts.born', {
                date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
                  new Date(`${s.member.birthday}T12:00:00`),
                ),
              })}
            </Text>
          ) : null}
        </View>
        <ShieldPlus size={28} color={colors.danger} />
      </View>

      <View
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        className={`flex-row items-center gap-2 rounded-md px-3 py-2 ${source === 'offline' || stale ? 'bg-warning' : 'bg-surface-muted'}`}
      >
        {source === 'offline' ? <CloudOff size={16} color="#ffffff" /> : null}
        <Text
          className={`flex-1 text-sm ${source === 'offline' || stale ? 'text-white' : 'text-muted'}`}
        >
          {t('m.contacts.asOf', { date: stand })}
          {source === 'offline' ? ` · ${t('m.contacts.offlineCopy')}` : ''}
        </Text>
      </View>

      {!card ? (
        <EmptyState
          title={t('m.contacts.noEmergencyCard')}
          message={t('m.contacts.noEmergencyCardHint')}
          action={
            writable ? (
              <Button title={t('m.contacts.createEmergencyCard')} onPress={editCard} />
            ) : undefined
          }
        />
      ) : (
        <>
          <Card>
            <InfoLine
              label={t('m.contacts.bloodType')}
              value={
                card.bloodType && card.bloodType !== 'unknown'
                  ? card.bloodType
                  : t('m.contacts.unknown')
              }
            />
            <Divider />
            <ListBlock label={t('m.contacts.allergies')} items={card.allergies} danger />
            <Divider />
            <ListBlock label={t('m.contacts.conditions')} items={card.conditions} />
            {card.medications ? (
              <>
                <Divider />
                <InfoLine label={t('m.contacts.medications')} value={card.medications} />
              </>
            ) : null}
          </Card>

          {card.insuranceProvider || card.insuranceNumber || card.insuranceNumberLast4 ? (
            <Card>
              <InfoLine
                label={t('m.contacts.insurance')}
                value={card.insuranceProvider ?? t('m.contacts.unknown')}
              />
              {card.insuranceNumber || card.insuranceNumberLast4 ? (
                <InfoLine
                  label={t('m.contacts.insuranceNumber')}
                  value={card.insuranceNumber ?? `•••• ${card.insuranceNumberLast4 ?? ''}`}
                />
              ) : null}
            </Card>
          ) : null}

          {s.doctor ? (
            <>
              <SectionHeader title={t('m.contacts.doctor')} />
              <RowGroup>
                <ContactCallRow contact={s.doctor} />
              </RowGroup>
            </>
          ) : null}

          {s.emergencyContacts.length > 0 ? (
            <>
              <SectionHeader title={t('m.contacts.emergencyContacts')} />
              <RowGroup>
                {s.emergencyContacts.map((c, i) => (
                  <View key={c.id}>
                    {i > 0 ? <Divider /> : null}
                    <ContactCallRow contact={c} />
                  </View>
                ))}
              </RowGroup>
            </>
          ) : null}

          {card.notes ? (
            <Card>
              <Text variant="label">{t('m.contacts.notes')}</Text>
              <Text>{card.notes}</Text>
            </Card>
          ) : null}
        </>
      )}
      <Text variant="caption" className="text-center">
        {t('m.contacts.emergencyOfflineHint')}
      </Text>
    </ScrollView>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5 py-1" accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption">{label}</Text>
      <Text className="text-lg font-semibold">{value}</Text>
    </View>
  );
}

function ListBlock({ label, items, danger }: { label: string; items: string[]; danger?: boolean }) {
  const { t } = useTranslation();
  return (
    <View
      className="gap-1 py-1"
      accessible
      accessibilityLabel={`${label}: ${items.join(', ') || t('common.none')}`}
    >
      <Text variant="caption">{label}</Text>
      {items.length === 0 ? (
        <Text>{t('common.none')}</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {items.map((item) => (
            <View
              key={item}
              className={`rounded-full px-3 py-1 ${danger ? 'bg-danger' : 'bg-surface-muted'}`}
            >
              <Text className={`text-sm font-semibold ${danger ? 'text-white' : 'text-text'}`}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ContactCallRow({ contact }: { contact: Contact }) {
  const phone = contact.phones[0];
  return (
    <ListRow
      title={contact.name}
      subtitle={phone ? phone.number : contact.organization}
      right={phone ? <CallButton name={contact.name} number={phone.number} /> : null}
      onPress={() => {
        router.push({ pathname: '/contacts/[contactId]', params: { contactId: contact.id } });
      }}
    />
  );
}
