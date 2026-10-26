import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ApiError } from '@fp/contracts';
import { serverApi } from '@/lib/server-api';
import { getSessionToken } from '@/lib/session';
import { TotpSetup } from './totp-setup';

export const metadata: Metadata = { title: 'Set up two-factor authentication' };

export default async function SetupTotpPage() {
  const token = await getSessionToken();
  if (!token) redirect('/login');
  let totpEnabled = false;
  let email = '';
  try {
    const me = await serverApi(token).me();
    totpEnabled = me.totpEnabled;
    email = me.email;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/api/auth/logout');
    // Some APIs restrict `me` until enrolment is finished; fall through to the enrolment UI.
  }
  if (totpEnabled) redirect('/');

  return (
    <main className="flex min-h-full items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">Two-factor authentication required</h1>
          <p className="mt-1 text-sm text-muted">
            Staff accounts must use an authenticator app (TOTP){email ? ` - ${email}` : ''}. You
            cannot use the console until enrolment is complete.
          </p>
        </div>
        <TotpSetup />
      </div>
    </main>
  );
}
