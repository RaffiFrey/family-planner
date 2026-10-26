import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { SignUpForm } from '@/features/auth/sign-up-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return { title: t('signUp') };
}

export default async function SignUpPage() {
  const t = await getTranslations('auth');
  return (
    <Card className="bg-background">
      <CardHeader className="p-6 pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('signUpTitle')}</h1>
        <CardDescription>{t('signUpSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-4">
        <Suspense>
          <SignUpForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
