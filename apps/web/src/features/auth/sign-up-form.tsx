'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
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

export function SignUpForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNext(search.get('next'), '/onboarding');
  const [formError, setFormError] = React.useState<string | null>(null);

  const schema = z.object({
    name: z.string().trim().min(1, t('nameRequired')).max(100),
    email: z.email(t('invalidEmail')),
    password: z.string().min(10, t('passwordTooShort')).max(128),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signUp.email({
      ...values,
      fetchOptions: { headers: { 'accept-language': locale } },
    });
    if (error) {
      setFormError(error.message ?? t('signUpFailed'));
      return;
    }
    router.replace(next);
    router.refresh();
  });

  const { errors, isSubmitting } = form.formState;
  return (
    <div className="grid gap-5">
      <SocialButtons callbackPath={next} />
      <OrDivider />
      <form className="grid gap-4" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field label={t('nameLabel')} error={errors.name?.message}>
          {(p) => <Input {...p} autoComplete="name" {...form.register('name')} />}
        </Field>
        <Field label={tc('email')} error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...form.register('email')} />}
        </Field>
        <Field label={tc('password')} error={errors.password?.message} hint={t('passwordHint')}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              {...form.register('password')}
            />
          )}
        </Field>
        {formError ? (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <Button type="submit" size="lg" loading={isSubmitting}>
          {tc('signUp')}
        </Button>
        <p className="text-xs text-muted">{t('terms')}</p>
      </form>
      <p className="text-center text-sm text-muted">
        {t('haveAccount')}{' '}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          {tc('signIn')}
        </Link>
      </p>
    </div>
  );
}
