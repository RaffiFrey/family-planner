import { apiQuery } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  ErrorState,
  LoadingView,
  ScreenScroll,
  Text,
  TextField,
} from '@/components/ui';
import { meQuery } from '@/features/household/household';
import { useSettings } from '@/features/settings/settings-store';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { errorMessage } from '@/lib/errors';

/** Invite deep link `familyplaner://join/<token>`: preview the household and join it. */
export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const signedIn = !!session.data?.user;
  const setPending = useSettings((s) => s.setPendingInviteToken);
  const setActive = useSettings((s) => s.setActiveHouseholdId);
  const [displayName, setDisplayName] = useState(session.data?.user.name ?? '');
  const preview = useQuery({
    ...apiQuery(api, 'households', 'previewInvitation', { params: { token } }),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () =>
      api.households.acceptInvitation({
        params: { token },
        body: { displayName: displayName.trim() },
      }),
    onSuccess: async (detail) => {
      setPending(null);
      setActive(detail.household.id);
      await queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
      router.dismissTo('/');
    },
  });

  if (preview.isPending) return <LoadingView />;
  if (preview.error) {
    return (
      <ScreenScroll>
        <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
        <Button
          variant="ghost"
          title={t('common.close')}
          onPress={() => {
            setPending(null);
            router.back();
          }}
        />
      </ScreenScroll>
    );
  }
  const p = preview.data;
  return (
    <ScreenScroll>
      <Card>
        <Text variant="heading">{t('m.join.invitedTo', { household: p.householdName })}</Text>
        <Text variant="caption">
          {t('m.join.invitedBy', { name: p.invitedBy, role: t(`roles.${p.role}`) })}
        </Text>
      </Card>
      {signedIn ? (
        <>
          <TextField
            label={t('m.onboarding.yourName')}
            value={displayName}
            onChangeText={setDisplayName}
          />
          {accept.error ? (
            <Text className="text-danger">{errorMessage(accept.error, t)}</Text>
          ) : null}
          <Button
            title={t('m.onboarding.join')}
            disabled={displayName.trim() === ''}
            loading={accept.isPending}
            onPress={() => {
              accept.mutate();
            }}
          />
        </>
      ) : (
        <>
          <Text>{t('m.join.signInFirst')}</Text>
          <Button
            title={t('common.signIn')}
            onPress={() => {
              setPending(token);
              router.replace('/sign-in');
            }}
          />
          <Button
            variant="secondary"
            title={t('common.signUp')}
            onPress={() => {
              setPending(token);
              router.replace('/sign-up');
            }}
          />
        </>
      )}
    </ScreenScroll>
  );
}
