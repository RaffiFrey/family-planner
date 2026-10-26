import { ApiError } from '@fp/api-client';
import type { TFunction } from 'i18next';
import { errorMessage, isPlanLimit } from '@/lib/errors';

/** Maps assistant API errors (402/403/429/502/503 and domain codes) to specific messages. */
export function assistantErrorMessage(e: unknown, t: TFunction): string {
  if (!(e instanceof ApiError)) return errorMessage(e, t);
  if (isPlanLimit(e)) return t('m.assistant.errors.planLimit');
  switch (e.problem.code) {
    case 'assistant_disabled':
      return t('m.assistant.errors.disabled');
    case 'assistant_quota':
      return t('m.assistant.errors.quota');
    case 'assistant_busy':
      return t('m.assistant.errors.busy');
    case 'assistant_refused':
      return t('m.assistant.errors.refused');
    case 'assistant_invalid_output':
    case 'assistant_upstream':
      return t('m.assistant.errors.upstream');
    case 'receipt_unreadable':
      return t('m.assistant.errors.unreadable');
    case 'file_not_ready':
      return t('m.assistant.errors.fileNotReady');
    case 'unsupported_file':
      return t('m.assistant.errors.unsupportedFile');
    case 'proposal_closed':
      return t('m.assistant.errors.proposalClosed');
    case 'account_required':
      return t('m.assistant.errors.accountRequired');
    case 'calendar_read_only':
      return t('m.assistant.errors.calendarReadOnly');
    case 'unavailable':
      return t('m.assistant.errors.notConfigured');
    default:
      break;
  }
  switch (e.status) {
    case 403:
      return t('m.assistant.errors.forbidden');
    case 429:
      return t('m.assistant.errors.quota');
    case 502:
      return t('m.assistant.errors.upstream');
    case 503:
      return t('m.assistant.errors.notConfigured');
    default:
      return errorMessage(e, t);
  }
}

/** True for API errors a retry a few seconds later can fix (scan still running). */
export function isFileNotReady(e: unknown): boolean {
  return e instanceof ApiError && e.problem.code === 'file_not_ready';
}
