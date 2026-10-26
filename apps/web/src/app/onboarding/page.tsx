import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { LoadingState } from '@/components/states';
import { OnboardingView } from '@/features/onboarding/onboarding-view';
import { PublicShell } from '@/features/shell/public-shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('createTitle') };
}

export default function OnboardingPage() {
  return (
    <PublicShell wide>
      <Suspense fallback={<LoadingState rows={4} />}>
        <OnboardingView />
      </Suspense>
    </PublicShell>
  );
}
