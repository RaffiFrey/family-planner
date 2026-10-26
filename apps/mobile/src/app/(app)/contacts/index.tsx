import type { ContactCategory } from '@fp/contracts';
import { router } from 'expo-router';
import { ShieldPlus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { ModuleGate } from '@/components/gates';
import {
  Avatar,
  ChipSelect,
  Divider,
  EmptyState,
  ErrorState,
  Fab,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
  TextField,
} from '@/components/ui';
import { CallButton } from '@/features/contacts/call-button';
import {
  CONTACT_CATEGORIES,
  useContacts,
  usePrefetchEmergencyCards,
} from '@/features/contacts/hooks';
import { useHousehold, useMembers } from '@/features/household/household';
import { useColors } from '@/lib/theme';
import { useDebounced } from '@/lib/use-debounced';

type Filter = ContactCategory | 'all';

export default function ContactsScreen() {
  return (
    <ModuleGate action="contacts.read">
      <Contacts />
    </ModuleGate>
  );
}

function Contacts() {
  const { t } = useTranslation();
  const colors = useColors();
  const { can } = useHousehold();
  const members = useMembers();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const contacts = useContacts({
    ...(filter !== 'all' ? { category: filter } : {}),
    ...(q ? { q } : {}),
  });
  // Keeps every member's emergency card stored on the device for offline use.
  usePrefetchEmergencyCards();

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-28"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={contacts.isRefetching}
            onRefresh={() => void contacts.refetch()}
          />
        }
      >
        <SectionHeader title={t('m.contacts.emergencyCards')} />
        <Text variant="caption">{t('m.contacts.emergencyHint')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3"
        >
          {members.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={t('m.contacts.openEmergencyCard', { name: m.displayName })}
              onPress={() => {
                router.push({
                  pathname: '/contacts/emergency/[memberId]',
                  params: { memberId: m.id },
                });
              }}
              className="w-28 items-center gap-2 rounded-lg border border-border bg-surface p-3 active:opacity-80"
            >
              <View>
                <Avatar name={m.displayName} color={m.color} size={44} />
                <View className="absolute -bottom-1 -right-1 rounded-full bg-danger p-1">
                  <ShieldPlus size={12} color="#ffffff" />
                </View>
              </View>
              <Text className="text-center text-sm" numberOfLines={1}>
                {m.displayName}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <SectionHeader title={t('m.contacts.addressBook')} />
        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder={t('m.contacts.searchPlaceholder')}
          accessibilityLabel={t('common.search')}
          autoCorrect={false}
          returnKeyType="search"
        />
        <ChipSelect<Filter>
          scroll
          label={t('m.contacts.category')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('common.all') },
            ...CONTACT_CATEGORIES.map((c) => ({
              value: c,
              label: t(`m.contacts.categories.${c}`),
            })),
          ]}
        />
        {contacts.isPending ? (
          <LoadingView />
        ) : contacts.error && !contacts.data ? (
          <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
        ) : contacts.data.length === 0 ? (
          <EmptyState title={t('m.contacts.empty')} message={t('m.contacts.emptyHint')} />
        ) : (
          <RowGroup>
            {contacts.data.map((c, i) => {
              const phone = c.phones[0];
              return (
                <View key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={c.name}
                    subtitle={[t(`m.contacts.categories.${c.category}`), c.organization]
                      .filter(Boolean)
                      .join(' · ')}
                    right={phone ? <CallButton name={c.name} number={phone.number} /> : null}
                    chevron
                    onPress={() => {
                      router.push({
                        pathname: '/contacts/[contactId]',
                        params: { contactId: c.id },
                      });
                    }}
                  />
                </View>
              );
            })}
          </RowGroup>
        )}
        <Text variant="caption" className="text-center" style={{ color: colors.textMuted }}>
          {t('m.contacts.offlineNote')}
        </Text>
      </ScrollView>
      {can('contacts.write') ? (
        <Fab
          label={t('m.contacts.add')}
          onPress={() => {
            router.push('/contacts/edit');
          }}
        />
      ) : null}
    </View>
  );
}
