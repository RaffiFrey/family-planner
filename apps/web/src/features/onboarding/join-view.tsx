'use client';

import { ApiError, apiQuery } from '@fp/api-client';
import { formatDate } from '@fp/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailOpen } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, LoadingState } from '@/components/states';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useHouseholdSelection } from '@/features/household/household-store';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';

export function JoinView({ token }: { token: string }) {
  const t = useTranslations('join');
  const tc = useTranslations('common');
  const tr = useTranslations('roles');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const setHouseholdId = useHouseholdSelection((s) => s.setHouseholdId);

  const preview = useQuery(apiQuery(api, 'households', 'previewInvitation', { params: { token } }));
  const me = useQuery(apiQuery(api, 'households', 'me'));
  const signedOut = me.error instanceof ApiError && me.error.status === 401;
  const [displayName, setDisplayName] = React.useState<string | null>(null);
  const name = displayName ?? me.data?.user.name ?? '';

  const accept = useMutation({
    mutationFn: () =>
      api.households.acceptInvitation({ params: { token }, body: { displayName: name.trim() } }),
    onSuccess: async (detail) => {
      setHouseholdId(detail.household.id);
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      toast.success(t('joined', { household: detail.household.name }));
      router.replace('/');
    },
    onError: toastError,
  });

  if (preview.isPending || me.isPending) return <LoadingState rows={3} />;
  if (preview.isError)
    return (
      <EmptyState
        icon={<MailOpen />}
        title={t('invalid')}
        action={
          <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
            {tc('back')}
          </Link>
        }
      />
    );

  const inv = preview.data;
  const next = encodeURIComponent(`/join/${token}`);
  return (
    <Card className="bg-background">
      <CardHeader className="p-6 pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm">
          {t('invitedBy', {
            name: inv.invitedBy,
            household: inv.householdName,
            role: tr(inv.role),
          })}
        </p>
        <p className="text-xs text-muted">
          {t('expires', {
            date: formatDate(
              inv.expiresAt,
              locale,
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            ),
          })}
        </p>
      </CardHeader>
      <CardContent className="p-6 pt-4">
        {signedOut ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted">{t('signInFirst')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href={`/sign-in?next=${next}`} className={buttonVariants()}>
                {tc('signIn')}
              </Link>
              <Link
                href={`/sign-up?next=${next}`}
                className={buttonVariants({ variant: 'secondary' })}
              >
                {tc('signUp')}
              </Link>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) accept.mutate();
            }}
          >
            <Field label={t('displayName')}>
              {(p) => (
                <Input
                  {...p}
                  value={name}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={60}
                  required
                />
              )}
            </Field>
            <Button type="submit" size="lg" loading={accept.isPending} disabled={!name.trim()}>
              {t('accept')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
