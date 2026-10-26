import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { JoinView } from '@/features/onboarding/join-view';
import { PublicShell } from '@/features/shell/public-shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('join');
  return { title: t('title') };
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <PublicShell>
      <JoinView token={token} />
    </PublicShell>
  );
}
