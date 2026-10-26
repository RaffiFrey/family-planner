import { Tabs } from 'expo-router/js-tabs';
import { CalendarDays, Ellipsis, House, ListChecks, SquareCheckBig } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useColors } from '@/lib/theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.home'),
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('nav.calendar'),
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: t('nav.tasks'),
          tabBarIcon: ({ color, size }) => <SquareCheckBig color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: t('nav.lists'),
          tabBarIcon: ({ color, size }) => <ListChecks color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('m.more.title'),
          tabBarIcon: ({ color, size }) => <Ellipsis color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
