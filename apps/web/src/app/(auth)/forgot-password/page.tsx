import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('forgotTitle') };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <Card className="bg-background">
      <CardHeader className="p-6 pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('forgotTitle')}</h1>
      </CardHeader>
      <CardContent className="grid gap-4 p-6 pt-2">
        <p className="text-sm text-muted">{t('forgotBody')}</p>
        <Link href="/sign-in" className={buttonVariants({ variant: 'secondary' })}>
          {t('backToSignIn')}
        </Link>
      </CardContent>
    </Card>
  );
}
