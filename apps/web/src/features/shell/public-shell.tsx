'use client';

import { Languages, Monitor, Moon, Sun } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setLocaleCookie } from '@/i18n/locale';
import { type ThemePreference, useTheme } from '@/providers/theme';
import { AppLogo } from './sidebar';

export function PreferenceToggles() {
  const t = useTranslations('shell');
  const locale = useLocale();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('language')}>
            <Languages aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={locale}
            onValueChange={(v) => {
              setLocaleCookie(v);
              router.refresh();
            }}
          >
            <DropdownMenuRadioItem value="de">Deutsch</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('theme.label')}>
            <ThemeIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(v) => setTheme(v as ThemePreference)}
          >
            <DropdownMenuRadioItem value="system">{t('theme.system')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Chrome for signed-out and onboarding pages. */
export function PublicShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <AppLogo />
        <PreferenceToggles />
      </header>
      <main
        className={
          wide
            ? 'mx-auto w-full max-w-4xl flex-1 px-4 py-8'
            : 'mx-auto w-full max-w-md flex-1 px-4 py-8'
        }
      >
        {children}
      </main>
    </div>
  );
}
