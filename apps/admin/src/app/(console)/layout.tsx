import { redirect } from 'next/navigation';
import type * as React from 'react';
import { ApiError } from '@fp/contracts';
import { AppShell } from '@/components/app-shell';
import { StaffProvider } from '@/components/staff-context';
import { serverApi } from '@/lib/server-api';
import { getSessionToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const token = await getSessionToken();
  if (!token) redirect('/login');

  let me;
  try {
    me = await serverApi(token).me();
  } catch (err) {
    // Server Components cannot clear cookies; the route handler does and returns to /login.
    if (err instanceof ApiError && err.status === 401) redirect('/api/auth/logout');
    throw err;
  }
  if (!me.totpEnabled) redirect('/setup-2fa');

  return (
    <StaffProvider staff={{ id: me.id, email: me.email, name: me.name, roles: me.roles }}>
      <AppShell>{children}</AppShell>
    </StaffProvider>
  );
}
