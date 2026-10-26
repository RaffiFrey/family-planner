import { getTranslations } from 'next-intl/server';
import type * as React from 'react';
import { SettingsNav } from '@/features/settings/settings-nav';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('settings');
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
