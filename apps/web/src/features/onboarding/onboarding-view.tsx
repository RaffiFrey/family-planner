'use client';

import { ApiError, apiQuery } from '@fp/api-client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { CreateHouseholdForm } from './create-household-form';

/** Accepts a full invitation URL (`…/join/<token>`) or the bare token. */
export function extractInviteToken(input: string): string | null {
  const trimmed = input.trim();
  const match = /\/join\/([^/?#\s]+)/.exec(trimmed);
  const token = match?.[1] ?? trimmed;
  return /^[\w-]{16,}$/.test(token) ? token : null;
}

export function OnboardingView() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const search = useSearchParams();
  const addingAnother = search.get('new') === '1';
  const me = useQuery(apiQuery(api, 'households', 'me'));
  const unauthorized = me.error instanceof ApiError && me.error.status === 401;
  const hasHousehold = (me.data?.memberships.length ?? 0) > 0;

  React.useEffect(() => {
    if (unauthorized) router.replace('/sign-in?next=/onboarding');
    else if (hasHousehold && !addingAnother) router.replace('/');
  }, [unauthorized, hasHousehold, addingAnother, router]);

  if (me.isPending || unauthorized || (hasHousehold && !addingAnother))
    return <LoadingState rows={4} />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;

  return (
    <div className="grid gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
        <Card className="bg-background">
          <CardHeader>
            <CardTitle>{t('createTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateHouseholdForm defaultDisplayName={me.data.user.name} />
          </CardContent>
        </Card>
        <JoinCard />
      </div>
    </div>
  );
}

function JoinCard() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const token = extractInviteToken(value);
    if (!token) {
      setError(t('invalidLink'));
      return;
    }
    router.push(`/join/${token}`);
  };
  return (
    <Card className="h-fit bg-background">
      <CardHeader>
        <CardTitle>{t('joinTitle')}</CardTitle>
        <CardDescription>{t('joinHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <Field label={t('inviteLink')} error={error}>
            {(p) => (
              <Input
                {...p}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(undefined);
                }}
              />
            )}
          </Field>
          <Button type="submit" variant="secondary">
            {t('join')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
