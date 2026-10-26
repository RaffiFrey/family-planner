import type { Action } from '@fp/domain/permissions';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import {
  Bell,
  BookUser,
  Car,
  Check,
  FileLock2,
  FolderOpen,
  GraduationCap,
  HeartPulse,
  Images,
  type LucideIcon,
  MapPin,
  Megaphone,
  Plane,
  Plus,
  Settings,
  Sparkles,
  Star,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Divider, ListRow, RowGroup, SectionHeader, Text } from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { notificationsQuery } from '@/features/notifications/queries';
import { useSettings } from '@/features/settings/settings-store';
import { useColors } from '@/lib/theme';

interface Entry {
  key: string;
  title: string;
  icon: LucideIcon;
  href: Href;
  action?: Action;
}

export default function MoreScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const { household, memberships, can } = useHousehold();
  const queryClient = useQueryClient();
  const setActive = useSettings((s) => s.setActiveHouseholdId);
  const notifications = useQuery(notificationsQuery());
  const unread = notifications.data?.unreadCount ?? 0;

  const groups: { key: string; title: string; entries: Entry[] }[] = [
    {
      key: 'family',
      title: t('m.moreGroups.family'),
      entries: [
        {
          key: 'pinboard',
          title: t('nav.pinboard'),
          icon: Megaphone,
          href: '/pinboard',
          action: 'pinboard.read',
        },
        {
          key: 'meals',
          title: t('nav.meals'),
          icon: UtensilsCrossed,
          href: '/meals',
          action: 'meals.read',
        },
        {
          key: 'rewards',
          title: t('nav.rewards'),
          icon: Star,
          href: '/rewards',
          action: 'rewards.read',
        },
        {
          key: 'location',
          title: t('nav.location'),
          icon: MapPin,
          href: '/location',
          action: 'location.read',
        },
        {
          key: 'photos',
          title: t('nav.photos'),
          icon: Images,
          href: '/photos',
          action: 'photos.read',
        },
        {
          key: 'travel',
          title: t('nav.travel'),
          icon: Plane,
          href: '/travel',
          action: 'travel.read',
        },
      ],
    },
    {
      key: 'care',
      title: t('m.moreGroups.care'),
      entries: [
        {
          key: 'contacts',
          title: t('nav.contacts'),
          icon: BookUser,
          href: '/contacts',
          action: 'contacts.read',
        },
        {
          key: 'health',
          title: t('nav.health'),
          icon: HeartPulse,
          href: '/health',
          action: 'health.read',
        },
        {
          key: 'school',
          title: t('nav.school'),
          icon: GraduationCap,
          href: '/school',
          action: 'school.read',
        },
      ],
    },
    {
      key: 'organize',
      title: t('m.moreGroups.organize'),
      entries: [
        {
          key: 'assistant',
          title: t('nav.assistant'),
          icon: Sparkles,
          href: '/assistant',
          action: 'assistant.read',
        },
        {
          key: 'vault',
          title: t('nav.vault'),
          icon: FileLock2,
          href: '/vault',
          action: 'vault.read',
        },
        {
          key: 'files',
          title: t('nav.storage'),
          icon: FolderOpen,
          href: '/files',
          action: 'storage.read',
        },
        {
          key: 'home-assets',
          title: t('nav.homeAssets'),
          icon: Car,
          href: '/home-assets',
          action: 'home.read',
        },
      ],
    },
    {
      key: 'money',
      title: t('m.moreGroups.money'),
      entries: [
        {
          key: 'finance',
          title: t('nav.finance'),
          icon: Wallet,
          href: '/finance',
          action: 'finance.read',
        },
      ],
    },
    {
      key: 'account',
      title: t('m.moreGroups.account'),
      entries: [
        { key: 'family-members', title: t('nav.household'), icon: Users, href: '/family' },
        { key: 'notifications', title: t('nav.notifications'), icon: Bell, href: '/notifications' },
        { key: 'settings', title: t('common.settings'), icon: Settings, href: '/settings' },
      ],
    },
  ];

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4 pb-12">
      {groups.map((group) => {
        const entries = group.entries.filter((e) => !e.action || can(e.action));
        if (entries.length === 0) return null;
        return (
          <View key={group.key} className="gap-2">
            <SectionHeader title={group.title} />
            <RowGroup>
              {entries.map((r, i) => (
                <View key={r.key}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={r.title}
                    left={<r.icon size={22} color={colors.primary} />}
                    right={
                      r.key === 'notifications' && unread > 0 ? (
                        <View
                          className="min-w-6 items-center rounded-full bg-danger px-2 py-0.5"
                          accessibilityLabel={t('m.notifications.unreadCount', { count: unread })}
                        >
                          <Text className="text-xs font-semibold text-white">{unread}</Text>
                        </View>
                      ) : null
                    }
                    chevron
                    onPress={() => {
                      router.push(r.href);
                    }}
                  />
                </View>
              ))}
            </RowGroup>
          </View>
        );
      })}

      <SectionHeader title={t('m.more.households')} />
      <RowGroup>
        {memberships.map((m, i) => (
          <View key={m.household.id}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              title={m.household.name}
              subtitle={`${t(`roles.${m.member.role}`)} · ${t(`plans.${m.household.plan}`)}`}
              right={
                m.household.id === household.id ? <Check size={20} color={colors.primary} /> : null
              }
              onPress={() => {
                if (m.household.id === household.id) return;
                setActive(m.household.id);
                // Different household: drop the old household's cached screens.
                void queryClient.invalidateQueries();
                router.navigate('/');
              }}
            />
          </View>
        ))}
        <Divider />
        <ListRow
          title={t('m.more.addHousehold')}
          left={<Plus size={20} color={colors.primary} />}
          onPress={() => {
            router.push('/household-new');
          }}
        />
      </RowGroup>
    </ScrollView>
  );
}
