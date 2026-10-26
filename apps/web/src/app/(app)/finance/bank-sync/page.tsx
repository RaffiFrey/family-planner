import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { BankSyncPage } from '@/features/finance-plus/bank-sync-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('financePlus');
  return { title: t('pageTitles.bankSync') };
}

export default function Page() {
  return (
    <Suspense>
      <BankSyncPage />
    </Suspense>
  );
}
