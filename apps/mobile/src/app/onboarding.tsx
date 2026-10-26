import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, ScreenScroll, Text, TextField } from '@/components/ui';
import { signOut } from '@/features/auth/sign-out';
import { CreateHouseholdForm } from '@/features/household/create-household-form';
import { useMe } from '@/features/household/household';
import { parseInviteToken } from '@/lib/links';

/** Shown after sign in while the user belongs to no household: create one or join by invite. */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const me = useMe();
  const [invite, setInvite] = useState('');
  const token = parseInviteToken(invite);
  return (
    <ScreenScroll>
      <Text variant="title">{t('m.onboarding.welcome', { name: me.data?.user.name ?? '' })}</Text>
      <Text variant="caption">{t('m.onboarding.intro')}</Text>
      <Card>
        <Text variant="heading">{t('m.onboarding.createTitle')}</Text>
        <CreateHouseholdForm defaultName={me.data?.user.name ?? ''} />
      </Card>
      <Card>
        <Text variant="heading">{t('m.onboarding.joinTitle')}</Text>
        <Text variant="caption">{t('m.onboarding.joinHint')}</Text>
        <TextField
          label={t('m.onboarding.inviteCode')}
          value={invite}
          onChangeText={setInvite}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          title={t('m.onboarding.join')}
          variant="secondary"
          disabled={!token}
          onPress={() => {
            if (token) router.push({ pathname: '/join/[token]', params: { token } });
          }}
        />
      </Card>
      <Button title={t('common.signOut')} variant="ghost" onPress={() => void signOut()} />
    </ScreenScroll>
  );
}
