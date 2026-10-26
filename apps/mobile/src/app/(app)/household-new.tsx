import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, ScreenScroll, Text, TextField } from '@/components/ui';
import { CreateHouseholdForm } from '@/features/household/create-household-form';
import { useHousehold } from '@/features/household/household';
import { parseInviteToken } from '@/lib/links';

/** Create a further household or join one with an invite code. */
export default function NewHouseholdScreen() {
  const { t } = useTranslation();
  const { me } = useHousehold();
  const [invite, setInvite] = useState('');
  const token = parseInviteToken(invite);
  return (
    <ScreenScroll>
      <Card>
        <CreateHouseholdForm
          defaultName={me.displayName}
          onCreated={() => {
            router.dismissTo('/');
          }}
        />
      </Card>
      <Card>
        <Text variant="heading">{t('m.onboarding.joinTitle')}</Text>
        <TextField
          label={t('m.onboarding.inviteCode')}
          value={invite}
          onChangeText={setInvite}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          variant="secondary"
          title={t('m.onboarding.join')}
          disabled={!token}
          onPress={() => {
            if (token) router.push({ pathname: '/join/[token]', params: { token } });
          }}
        />
      </Card>
    </ScreenScroll>
  );
}
