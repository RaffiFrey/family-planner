import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ProblemDetails } from '@fp/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  429: 'Too Many Requests',
};

/** Renders every error as RFC 9457 `application/problem+json`. Unknown errors never leak details. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();
    const problem = this.toProblem(exception, req.url);
    if (problem.status >= 500)
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    void reply
      .status(problem.status)
      .header('content-type', 'application/problem+json')
      .send(problem);
  }

  private toProblem(exception: unknown, instance: string): ProblemDetails {
    if (exception instanceof AppError) {
      const body = exception.getResponse() as { title: string; detail?: string };
      return {
        type: `https://family-planer.app/problems/${exception.code}`,
        title: body.title,
        status: exception.getStatus(),
        code: exception.code,
        instance,
        ...(exception.detail ? { detail: exception.detail } : {}),
        ...(exception.errors ? { errors: exception.errors } : {}),
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message = typeof res === 'string' ? res : (res as { message?: unknown }).message;
      return {
        type: 'about:blank',
        title: TITLES[status] ?? 'Error',
        status,
        instance,
        ...(typeof message === 'string' ? { detail: message } : {}),
      };
    }
    // Fastify errors (body too large, bad JSON …) carry a statusCode.
    const statusCode = (exception as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return {
        type: 'about:blank',
        title: TITLES[statusCode] ?? 'Bad Request',
        status: statusCode,
        instance,
        detail: (exception as Error).message,
      };
    }
    return { type: 'about:blank', title: 'Internal Server Error', status: 500, instance };
  }
}
