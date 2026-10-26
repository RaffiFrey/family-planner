'use client';

import { useMutation } from '@tanstack/react-query';
import { CopyIcon, KeyRoundIcon, LogOutIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { api, errorMessage } from '@/lib/api';
import { logoutAction } from '@/lib/auth-actions';

function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

export function TotpSetup() {
  const router = useRouter();
  const [code, setCode] = React.useState('');

  const setup = useMutation({ mutationFn: () => api.setupTotp() });
  const confirm = useMutation({
    mutationFn: (c: string) => api.confirmTotp({ body: { code: c } }),
    onSuccess: () => {
      toast.success('Two-factor authentication enabled');
      router.replace('/');
      router.refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success('Copied'),
      () => toast.error('Copy failed'),
    );
  };

  return (
    <Card>
      <CardContent className="grid gap-4">
        {!setup.data ? (
          <>
            <p className="text-sm">
              Step 1: generate a secret and add it to your authenticator app (1Password, Authy,
              Google Authenticator, ...).
            </p>
            {setup.error ? (
              <p className="text-xs text-danger">{errorMessage(setup.error)}</p>
            ) : null}
            <Button
              onClick={() => {
                setup.mutate();
              }}
              disabled={setup.isPending}
            >
              <KeyRoundIcon />
              {setup.isPending ? 'Generating...' : 'Generate secret'}
            </Button>
          </>
        ) : (
          <>
            <div className="grid gap-2">
              <p className="text-sm">Step 1: add this account to your authenticator app.</p>
              <div className="flex items-center gap-2 rounded-sm border border-border bg-background p-2">
                <code
                  className="flex-1 font-mono text-sm tracking-wider break-all"
                  data-testid="totp-secret"
                >
                  {groupSecret(setup.data.secret)}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Copy secret"
                  onClick={() => {
                    copy(setup.data.secret);
                  }}
                >
                  <CopyIcon />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <a href={setup.data.otpauthUrl} className="text-primary hover:underline">
                  Open in authenticator app (otpauth link)
                </a>
                <button
                  type="button"
                  className="text-muted hover:text-foreground hover:underline"
                  onClick={() => {
                    copy(setup.data.otpauthUrl);
                  }}
                >
                  Copy otpauth URL
                </button>
              </div>
            </div>
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (/^\d{6}$/.test(code)) confirm.mutate(code);
                else toast.error('Enter the 6-digit code.');
              }}
            >
              <Field label="Step 2: enter the current 6-digit code" htmlFor="code">
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, ''));
                  }}
                  autoFocus
                />
              </Field>
              <Button type="submit" disabled={confirm.isPending || code.length !== 6}>
                {confirm.isPending ? 'Verifying...' : 'Confirm and continue'}
              </Button>
            </form>
          </>
        )}
        <form action={logoutAction} className="border-t border-border pt-3">
          <Button type="submit" variant="ghost" size="sm">
            <LogOutIcon />
            Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
