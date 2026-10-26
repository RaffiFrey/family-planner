'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { loginAction, type LoginState } from '@/lib/auth-actions';

export function LoginForm({ expired }: { expired: boolean }) {
  const [state, formAction, pending] = React.useActionState<LoginState, FormData>(loginAction, {});
  const [showTotp, setShowTotp] = React.useState(false);
  const totpVisible = showTotp || Boolean(state.needTotp);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="grid gap-3" data-testid="login-form">
          {expired && !state.error ? (
            <p
              role="status"
              className="rounded-sm bg-warning/15 px-2.5 py-1.5 text-xs text-warning"
            >
              Your session has expired. Please sign in again.
            </p>
          ) : null}
          {state.error ? (
            <p role="alert" className="rounded-sm bg-danger/15 px-2.5 py-1.5 text-xs text-danger">
              {state.error}
            </p>
          ) : null}
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              defaultValue={state.email ?? ''}
              autoFocus
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
            />
          </Field>
          {totpVisible ? (
            <Field
              label="Authenticator code"
              htmlFor="totp"
              hint="6-digit code from your authenticator app."
            >
              <Input
                id="totp"
                name="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                autoFocus={Boolean(state.needTotp)}
              />
            </Field>
          ) : (
            <button
              type="button"
              className="justify-self-start text-xs text-primary hover:underline"
              onClick={() => {
                setShowTotp(true);
              }}
            >
              I have an authenticator code
            </button>
          )}
          <Button type="submit" disabled={pending} className="mt-1">
            {pending ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
