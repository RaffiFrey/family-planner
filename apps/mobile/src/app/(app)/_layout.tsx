import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LoadingView } from '@/components/ui';
import { usePrefetchEmergencyCards } from '@/features/contacts/hooks';
import { HouseholdProvider, useHousehold, useMe } from '@/features/household/household';
import { LocationSharingProvider } from '@/features/location/sharing-context';
import { useNotificationDeepLinks, usePushRegistration } from '@/features/notifications/push';
import { useRealtime } from '@/lib/sync';
import { modalPresentation } from '@/lib/stack-options';
import { useColors } from '@/lib/theme';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  const me = useMe();
  if (!me.data) return <LoadingView />;
  return (
    <HouseholdProvider me={me.data}>
      <LocationSharingProvider>
        <AppStack />
      </LocationSharingProvider>
    </HouseholdProvider>
  );
}

function AppStack() {
  const { householdId } = useHousehold();
  const { t } = useTranslation();
  const colors = useColors();
  useRealtime(householdId);
  // Keeps the emergency cards stored on the device for offline use.
  usePrefetchEmergencyCards();
  usePushRegistration();
  useNotificationDeepLinks();
  const modal = modalPresentation;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="events/new" options={{ ...modal, title: t('m.calendar.newEvent') }} />
      <Stack.Screen name="events/[eventId]" options={{ title: t('m.calendar.event') }} />
      <Stack.Screen name="tasks/new" options={{ ...modal, title: t('m.tasks.newTask') }} />
      <Stack.Screen name="tasks/[taskId]" options={{ title: t('m.tasks.task') }} />
      <Stack.Screen name="lists/new" options={{ ...modal, title: t('m.lists.newList') }} />
      <Stack.Screen name="lists/[listId]" options={{ title: '' }} />
      <Stack.Screen name="finance" options={{ headerShown: false }} />
      <Stack.Screen name="files" options={{ headerShown: false }} />
      <Stack.Screen name="pinboard" options={{ headerShown: false }} />
      <Stack.Screen name="rewards" options={{ headerShown: false }} />
      <Stack.Screen name="meals" options={{ headerShown: false }} />
      <Stack.Screen name="contacts" options={{ headerShown: false }} />
      <Stack.Screen name="health" options={{ headerShown: false }} />
      <Stack.Screen name="school" options={{ headerShown: false }} />
      <Stack.Screen name="home-assets" options={{ headerShown: false }} />
      <Stack.Screen name="vault" options={{ headerShown: false }} />
      <Stack.Screen name="location" options={{ headerShown: false }} />
      <Stack.Screen name="travel" options={{ headerShown: false }} />
      <Stack.Screen name="photos" options={{ headerShown: false }} />
      <Stack.Screen name="integrations" options={{ headerShown: false }} />
      <Stack.Screen name="assistant" options={{ headerShown: false, ...modalPresentation }} />
      <Stack.Screen name="family" options={{ title: t('nav.household') }} />
      <Stack.Screen name="notifications" options={{ title: t('nav.notifications') }} />
      <Stack.Screen name="settings" options={{ title: t('common.settings') }} />
      <Stack.Screen
        name="household-new"
        options={{ ...modal, title: t('m.onboarding.createTitle') }}
      />
    </Stack>
  );
}
