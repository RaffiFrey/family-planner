'use server';

import { redirect } from 'next/navigation';
import { ApiError, StaffLoginBody } from '@fp/contracts';
import { serverApi } from './server-api';
import { clearSessionToken, getSessionToken, setSessionToken } from './session';

export interface LoginState {
  error?: string;
  /** Set when the API signals that a TOTP code is needed (or was wrong). */
  needTotp?: boolean;
  email?: string;
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Staff login as a Server Function: the bearer token returned by the admin API is stored
 * in an httpOnly, SameSite=Strict cookie and never handed to browser JavaScript.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = str(formData.get('email'));
  const totp = str(formData.get('totp'));
  const parsed = StaffLoginBody.safeParse({
    email,
    password: typeof formData.get('password') === 'string' ? formData.get('password') : '',
    totp: totp === '' ? undefined : totp,
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const msg =
      field === 'email'
        ? 'Please enter a valid email address.'
        : field === 'password'
          ? 'Password must have at least 8 characters.'
          : 'The authenticator code has 6 digits.';
    return { error: msg, email, needTotp: totp !== '' };
  }

  let target: string;
  try {
    const session = await serverApi(null).login({ body: parsed.data });
    await setSessionToken(session.token, session.expiresAt);
    target = session.totpSetupRequired || !session.staff.totpEnabled ? '/setup-2fa' : '/';
  } catch (err) {
    if (err instanceof ApiError) {
      const code = err.problem.code ?? '';
      const needTotp = code.includes('totp') || Boolean(parsed.data.totp);
      if (err.status === 429)
        return { error: 'Too many attempts. Please wait a moment and try again.', email, needTotp };
      if (err.status === 401 || err.status === 400 || err.status === 403) {
        return {
          error:
            code.includes('totp') && !parsed.data.totp
              ? 'Enter the 6-digit code from your authenticator app.'
              : 'Invalid email, password or authenticator code.',
          email,
          needTotp,
        };
      }
      return { error: err.message, email, needTotp };
    }
    return { error: 'The admin API is not reachable. Please try again later.', email };
  }
  redirect(target);
}

export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    try {
      await serverApi(token).logout();
    } catch {
      // Session may already be gone upstream; clearing the cookie is what matters locally.
    }
  }
  await clearSessionToken();
  redirect('/login');
}
