import { HttpException } from '@nestjs/common';
import type { ProblemDetails } from '@fp/contracts';

/** HTTP error rendered as RFC 9457 problem details by ProblemFilter. */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    title: string,
    readonly detail?: string,
    readonly errors?: ProblemDetails['errors'],
  ) {
    super({ title, code, detail }, status);
  }
}

export const badRequest = (detail: string, code = 'bad_request') =>
  new AppError(400, code, 'Bad Request', detail);
export const unauthorized = () =>
  new AppError(401, 'unauthorized', 'Unauthorized', 'Authentication required');
export const forbidden = (detail = 'You are not allowed to do this') =>
  new AppError(403, 'forbidden', 'Forbidden', detail);
export const notFound = (what = 'Resource') =>
  new AppError(404, 'not_found', 'Not Found', `${what} not found`);
export const conflict = (detail: string, code = 'conflict') =>
  new AppError(409, code, 'Conflict', detail);
export const planLimit = (detail: string) =>
  new AppError(402, 'plan_limit', 'Upgrade required', detail);
export const unavailable = (detail: string) =>
  new AppError(503, 'unavailable', 'Service Unavailable', detail);
export const validationError = (errors: NonNullable<ProblemDetails['errors']>) =>
  new AppError(422, 'validation_failed', 'Validation failed', 'The request is invalid', errors);
