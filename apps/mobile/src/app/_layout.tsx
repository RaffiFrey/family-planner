import '@/lib/polyfills';
import '@/global.css';
import '@/i18n';
import '@/features/location/background-task';

import { useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogBox, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Button, ErrorState, OfflineBanner } from '@/components/ui';
import { signOut } from '@/features/auth/sign-out';
import { useMe } from '@/features/household/household';
import { useSettings } from '@/features/settings/settings-store';
import { useApplyLocaleSetting } from '@/i18n';
import { authClient } from '@/lib/auth-client';
import { PERSIST_BUSTER, PERSIST_MAX_AGE, queryClient, queryPersister } from '@/lib/query-client';
import { useAppFocusManager, useConnectivityMonitor } from '@/lib/sync';
import { ThemeRoot, useColors } from '@/lib/theme';
import { modalPresentation } from '@/lib/stack-options';

// Dev-only warning banners overlay the tab bar and make UI automation flaky.
if (process.env.EXPO_PUBLIC_E2E === '1') LogBox.ignoreAllLogs();

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: PERSIST_MAX_AGE,
          buster: PERSIST_BUSTER,
          dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' },
        }}
      >
        <ThemeRoot>
          <RootNavigator />
        </ThemeRoot>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  useApplyLocaleSetting();
  useAppFocusManager();
  useConnectivityMonitor();
  const { t } = useTranslation();
  const colors = useColors();
  const restoring = useIsRestoring();
  const session = authClient.useSession();
  const hasSession = !!session.data?.user;
  const me = useMe(hasSession && !restoring);
  // Offline start: the session check fails, but a cached profile means we were signed in.
  const signedIn = hasSession || (session.error != null && me.data !== undefined);
  const hasHousehold = (me.data?.memberships.length ?? 0) > 0;
  const ready =
    !restoring && !session.isPending && (!signedIn || me.data !== undefined || me.isError);
  const pendingInvite = useSettings((s) => s.pendingInviteToken);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // An invite link opened before signing in is resumed afterwards.
  useEffect(() => {
    if (ready && signedIn && pendingInvite)
      router.push({ pathname: '/join/[token]', params: { token: pendingInvite } });
  }, [ready, signedIn, pendingInvite]);

  if (!ready) return null;
  if (signedIn && !me.data) {
    return (
      <ThemedCenter>
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
        <Button title={t('common.signOut')} variant="ghost" onPress={() => void signOut()} />
      </ThemedCenter>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !hasHousehold}>
          <Stack.Screen name="onboarding" options={{ title: t('m.onboarding.title') }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && hasHousehold}>
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen
          name="join/[token]"
          options={{ title: t('m.join.title'), ...modalPresentation }}
        />
      </Stack>
      <OfflineBanner />
    </>
  );
}

function ThemedCenter({ children }: { children: ReactNode }) {
  return <View className="flex-1 items-center justify-center bg-background p-6">{children}</View>;
}
