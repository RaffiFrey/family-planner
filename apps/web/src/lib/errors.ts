'use client';

import { ApiError } from '@fp/api-client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';

export function isPlanLimit(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 402 || err.problem.code === 'plan_limit');
}

/** Maps any thrown value (ApiError, network failure, ...) to a user-facing message. */
export function useErrorMessage(): (err: unknown) => string {
  const t = useTranslations('errors');
  const tc = useTranslations('common');
  const ti = useTranslations('integrations');
  return useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        if (isPlanLimit(err)) return err.problem.detail ?? t('planLimit');
        if (err.problem.code === 'calendar_read_only') return ti('readOnly.error');
        switch (err.status) {
          case 401:
            return t('unauthorized');
          case 403:
            return t('forbidden');
          case 404:
            return t('notFound');
          case 409:
            return t('conflict');
          case 422:
          case 400:
            return err.problem.detail ?? t('validation');
          case 429:
            return t('rateLimited');
          default:
            return err.problem.detail ?? tc('unknownError');
        }
      }
      if (err instanceof TypeError) return tc('offline');
      return tc('unknownError');
    },
    [t, tc, ti],
  );
}

/** Shows an error toast; plan limits get an "Upgrade" action that opens billing. */
export function useToastError(): (err: unknown) => void {
  const message = useErrorMessage();
  const router = useRouter();
  const t = useTranslations('ui');
  return useCallback(
    (err: unknown) => {
      if (isPlanLimit(err)) {
        toast.error(message(err), {
          action: { label: t('upgrade'), onClick: () => router.push('/settings/billing') },
        });
        return;
      }
      toast.error(message(err));
    },
    [message, router, t],
  );
}

/** Copies 422 `problem.errors` onto react-hook-form fields. Returns true when anything was applied. */
export function applyFieldErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
): boolean {
  if (!(err instanceof ApiError) || !err.problem.errors?.length) return false;
  for (const e of err.problem.errors) {
    const path = e.path
      .replace(/^body\./, '')
      .replace(/^\//, '')
      .replaceAll('/', '.');
    setError(path as Path<T>, { type: 'server', message: e.message });
  }
  return true;
}
