import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionToken } from '@/lib/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // Already signed in: the console layout validates the session and bounces back here if it is stale.
  if (!sp.expired && (await getSessionToken())) redirect('/');
  return (
    <main className="flex min-h-full items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">
            Family Planer
          </p>
          <h1 className="text-xl font-semibold">Staff console</h1>
          <p className="mt-1 text-sm text-muted">Internal use only. All actions are audited.</p>
        </div>
        <LoginForm expired={Boolean(sp.expired)} />
      </div>
    </main>
  );
}
