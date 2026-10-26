'use client';

import type { Locale } from '@fp/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { Languages, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MemberAvatar } from '@/components/member-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHousehold } from '@/features/household/household-context';
import { setLocaleCookie } from '@/i18n/locale';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { type ThemePreference, useTheme } from '@/providers/theme';

export function useLocaleSwitch(): (locale: Locale) => void {
  const router = useRouter();
  return (locale) => {
    setLocaleCookie(locale);
    router.refresh();
  };
}

export function UserMenu() {
  const t = useTranslations('shell');
  const tc = useTranslations('common');
  const locale = useLocale();
  const switchLocale = useLocaleSwitch();
  const { theme, setTheme } = useTheme();
  const { me, member } = useHousehold();
  const router = useRouter();
  const queryClient = useQueryClient();

  const onLocale = (value: string) => {
    if (value !== 'de' && value !== 'en') return;
    switchLocale(value);
    // Persist on the account too so emails and push texts use the same language.
    api.households.updateMe({ body: { locale: value } }).catch(() => undefined);
  };

  const signOut = async () => {
    await authClient.signOut().catch(() => undefined);
    queryClient.clear();
    router.replace('/sign-in');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={t('userMenu')}
      >
        <MemberAvatar member={member} size="md" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-foreground">
          <div className="truncate text-sm font-semibold">{me.user.name}</div>
          {me.user.email ? (
            <div className="truncate text-xs font-normal text-muted">{me.user.email}</div>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          <Languages className="size-3.5" aria-hidden />
          {t('language')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={onLocale}>
          <DropdownMenuRadioItem value="de">Deutsch</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('theme.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden />
            {t('theme.system')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden />
            {t('theme.light')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden />
            {t('theme.dark')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/account">
            <Settings aria-hidden />
            {tc('settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          {tc('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
