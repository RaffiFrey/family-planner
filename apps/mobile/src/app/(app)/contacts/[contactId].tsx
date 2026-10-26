import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Mail, MapPin, Pencil, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  Avatar,
  Card,
  Divider,
  ErrorState,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  ScreenScroll,
  SectionHeader,
  Text,
} from '@/components/ui';
import { openMail } from '@/features/contacts/call';
import { CallButton } from '@/features/contacts/call-button';
import { useContact } from '@/features/contacts/hooks';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { api } from '@/lib/api';
import { confirmAsync, showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

export default function ContactDetailScreen() {
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId, can } = useHousehold();
  const members = useMemberMap();
  const queryClient = useQueryClient();
  const contact = useContact(contactId);
  const remove = useMutation({
    mutationFn: () => api.contacts.remove({ params: { householdId, contactId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      router.back();
    },
    onError: (e) => {
      showError(e, t);
    },
  });

  if (contact.isPending) return <LoadingView />;
  if (contact.error && !contact.data)
    return <ErrorState error={contact.error} onRetry={() => void contact.refetch()} />;
  const c = contact.data;
  const writable = can('contacts.write');

  return (
    <ScreenScroll>
      <Stack.Screen
        options={{
          title: c.name,
          headerRight: () =>
            writable ? (
              <View className="flex-row">
                <IconButton
                  label={t('common.edit')}
                  onPress={() => {
                    router.push({ pathname: '/contacts/edit', params: { contactId } });
                  }}
                >
                  <Pencil size={20} color={colors.text} />
                </IconButton>
                <IconButton
                  label={t('common.delete')}
                  onPress={() => {
                    void confirmAsync(t('m.contacts.deleteTitle'), c.name, {
                      confirmLabel: t('common.delete'),
                      cancelLabel: t('common.cancel'),
                      destructive: true,
                    }).then((ok) => {
                      if (ok) remove.mutate();
                    });
                  }}
                >
                  <Trash2 size={20} color={colors.danger} />
                </IconButton>
              </View>
            ) : null,
        }}
      />
      <View className="gap-1">
        <Text variant="title">{c.name}</Text>
        <Text variant="caption">
          {[t(`m.contacts.categories.${c.category}`), c.organization].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {c.phones.length > 0 ? (
        <>
          <SectionHeader title={t('m.contacts.phones')} />
          <RowGroup>
            {c.phones.map((p, i) => (
              <View key={`${p.number}-${String(i)}`}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={p.number}
                  subtitle={p.label ?? t('m.contacts.phone')}
                  right={<CallButton name={c.name} number={p.number} />}
                />
              </View>
            ))}
          </RowGroup>
        </>
      ) : null}

      {c.email || c.address ? (
        <RowGroup>
          {c.email ? (
            <ListRow
              title={c.email}
              subtitle={t('common.email')}
              left={<Mail size={20} color={colors.primary} />}
              onPress={() => void openMail(c.email ?? '')}
            />
          ) : null}
          {c.email && c.address ? <Divider /> : null}
          {c.address ? (
            <ListRow
              title={c.address}
              subtitle={t('m.contacts.address')}
              left={<MapPin size={20} color={colors.primary} />}
            />
          ) : null}
        </RowGroup>
      ) : null}

      {c.memberIds.length > 0 ? (
        <Card>
          <Text variant="label">{t('m.contacts.belongsTo')}</Text>
          <View className="flex-row flex-wrap gap-3">
            {c.memberIds.map((id) => {
              const m = members.get(id);
              if (!m) return null;
              return (
                <View key={id} className="flex-row items-center gap-2">
                  <Avatar name={m.displayName} color={m.color} size={28} />
                  <Text>{m.displayName}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {c.notes ? (
        <Card>
          <Text variant="label">{t('m.contacts.notes')}</Text>
          <Text>{c.notes}</Text>
        </Card>
      ) : null}
    </ScreenScroll>
  );
}
