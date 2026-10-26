'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

type Provider = 'google' | 'apple';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1ZM13.9 5c.7-.9 1.2-2 1-3.2-1 .1-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5Z" />
    </svg>
  );
}

/** Optional OAuth sign-in; the API decides which providers are configured. */
export function SocialButtons({ callbackPath = '/' }: { callbackPath?: string }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const [pending, setPending] = React.useState<Provider | null>(null);

  const signIn = async (provider: Provider) => {
    setPending(provider);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: `${window.location.origin}${callbackPath}`,
    });
    if (error) {
      toast.error(error.message ?? tc('unknownError'));
      setPending(null);
    }
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button
        variant="secondary"
        loading={pending === 'google'}
        onClick={() => void signIn('google')}
      >
        {pending === 'google' ? null : <GoogleIcon />}
        {t('google')}
      </Button>
      <Button
        variant="secondary"
        loading={pending === 'apple'}
        onClick={() => void signIn('apple')}
      >
        {pending === 'apple' ? null : <AppleIcon />}
        {t('apple')}
      </Button>
    </div>
  );
}

export function OrDivider() {
  const t = useTranslations('auth');
  return (
    <div className="flex items-center gap-3 text-xs text-muted uppercase" role="separator">
      <span className="h-px flex-1 bg-border" />
      {t('or')}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
