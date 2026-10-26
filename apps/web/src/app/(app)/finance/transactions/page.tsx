import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { LoadingState } from '@/components/states';
import { TransactionsPage } from '@/features/finance/transactions-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.transactions');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState rows={6} />}>
      <TransactionsPage />
    </Suspense>
  );
}
