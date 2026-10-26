import { ApiError } from '@fp/api-client';
import type { TFunction } from 'i18next';
import { isNetworkError } from './connectivity';

/** Client-side validation failure; its message is already translated. */
export class FormError extends Error {
  override name = 'FormError';
}

export function isPlanLimit(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 402 || e.problem.code === 'plan_limit');
}

/** User-facing message for any error thrown by the API client. */
export function errorMessage(e: unknown, t: TFunction): string {
  if (e instanceof FormError) return e.message;
  if (isNetworkError(e)) return t('common.offline');
  if (e instanceof ApiError) {
    if (isPlanLimit(e)) return e.problem.detail ?? t('errors.planLimit');
    switch (e.status) {
      case 401:
        return t('errors.unauthorized');
      case 403:
        return t('errors.forbidden');
      case 404:
        return t('errors.notFound');
      case 409:
        return t('errors.conflict');
      case 400:
      case 422:
        return e.problem.errors?.[0]?.message ?? e.problem.detail ?? t('errors.validation');
      case 429:
        return t('errors.rateLimited');
      default:
        return e.problem.detail ?? t('common.unknownError');
    }
  }
  return t('common.unknownError');
}
