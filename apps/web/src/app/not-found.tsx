import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default async function NotFound() {
  const t = await getTranslations('errors');
  const tn = await getTranslations('nav');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="text-xl font-semibold">{t('notFound')}</h1>
      <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
        {tn('home')}
      </Link>
    </main>
  );
}
