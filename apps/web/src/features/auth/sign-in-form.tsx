'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { OrDivider, SocialButtons } from './social-buttons';
import { safeNext } from './safe-next';

function needsTwoFactor(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'twoFactorRedirect' in data &&
    data.twoFactorRedirect === true
  );
}

export function SignInForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNext(search.get('next'));
  const [formError, setFormError] = React.useState<string | null>(null);
  const [passkeyPending, setPasskeyPending] = React.useState(false);
  const [twoFactor, setTwoFactor] = React.useState(false);

  const schema = z.object({
    email: z.email(t('invalidEmail')),
    password: z.string().min(1, t('passwordTooShort')),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const done = () => {
    router.replace(next);
    router.refresh();
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { data, error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setFormError(
        error.status === 401 || error.status === 400
          ? t('signInFailed')
          : (error.message ?? tc('unknownError')),
      );
      return;
    }
    if (needsTwoFactor(data)) {
      setTwoFactor(true);
      return;
    }
    done();
  });

  const signInWithPasskey = async () => {
    setFormError(null);
    setPasskeyPending(true);
    const result = await authClient.signIn.passkey();
    setPasskeyPending(false);
    if (result.error) {
      setFormError(t('passkeyFailed'));
      return;
    }
    done();
  };

  // Offer passkeys via browser autofill (conditional UI) when supported.
  React.useEffect(() => {
    if (!('PublicKeyCredential' in window)) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    const run = async () => {
      try {
        const available = await window.PublicKeyCredential.isConditionalMediationAvailable();
        if (!available || isCancelled()) return;
        const result = await authClient.signIn.passkey({ autoFill: true });
        if (!isCancelled() && !result.error) done();
      } catch {
        // Conditional UI not supported; the explicit passkey button still works.
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  if (twoFactor) return <TwoFactorForm onDone={done} />;

  const { errors, isSubmitting } = form.formState;
  return (
    <div className="grid gap-5">
      <Button
        variant="secondary"
        size="lg"
        loading={passkeyPending}
        onClick={() => void signInWithPasskey()}
      >
        {passkeyPending ? null : <KeyRound aria-hidden />}
        {t('passkey')}
      </Button>
      <SocialButtons callbackPath={next} />
      <OrDivider />
      <form className="grid gap-4" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field label={tc('email')} error={errors.email?.message}>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="username webauthn"
              {...form.register('email')}
            />
          )}
        </Field>
        <Field label={tc('password')} error={errors.password?.message}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password webauthn"
              {...form.register('password')}
            />
          )}
        </Field>
        <div className="-mt-2 text-right">
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            {t('forgotPassword')}
          </Link>
        </div>
        {formError ? (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <Button type="submit" size="lg" loading={isSubmitting}>
          {tc('signIn')}
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        {t('noAccount')}{' '}
        <Link
          href={`/sign-up${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`}
          className="font-medium text-primary hover:underline"
        >
          {tc('signUp')}
        </Link>
      </p>
    </div>
  );
}

function TwoFactorForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('auth');
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setPending(true);
    const result = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? t('signInFailed'));
      return;
    }
    onDone();
  };

  return (
    <form className="grid gap-4" onSubmit={(e) => void submit(e)}>
      <div>
        <h2 className="text-lg font-semibold">{t('twoFactorTitle')}</h2>
        <p className="text-sm text-muted">{t('twoFactorHint')}</p>
      </div>
      <Field label={t('twoFactorCode')} error={error ?? undefined}>
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
        )}
      </Field>
      <Button type="submit" size="lg" loading={pending} disabled={code.trim().length < 6}>
        {t('verify')}
      </Button>
    </form>
  );
}
