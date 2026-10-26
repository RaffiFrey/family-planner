import {
  applyDecorators,
  createParamDecorator,
  Delete,
  type ExecutionContext,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  SetMetadata,
} from '@nestjs/common';
import type { Action } from '@fp/domain/permissions';
import type { EndpointBody, EndpointDef, EndpointParams, EndpointQuery } from '@fp/contracts';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { validationError } from './errors.js';

export const ENDPOINT_META = 'fp:endpoint';

export interface EndpointMeta {
  endpoint: EndpointDef;
  /** Permission checked against the caller's household role (see @fp/domain/permissions). */
  action?: Action;
}

const METHODS = { GET: Get, POST: Post, PUT: Put, PATCH: Patch, DELETE: Delete } as const;

/**
 * Binds a controller method to a contract endpoint: route, status code, input validation
 * (@Input), response validation (ResponseInterceptor), auth and permission checks (guards).
 */
export function Endpoint(endpoint: EndpointDef, options: { action?: Action } = {}) {
  const meta: EndpointMeta = { endpoint, ...options };
  return applyDecorators(
    METHODS[endpoint.method](endpoint.path),
    HttpCode(endpoint.status ?? (endpoint.method === 'POST' ? 201 : 200)),
    SetMetadata(ENDPOINT_META, meta),
  );
}

export function getEndpointMeta(ctx: ExecutionContext): EndpointMeta | undefined {
  return Reflect.getMetadata(ENDPOINT_META, ctx.getHandler()) as EndpointMeta | undefined;
}

/** Validated request input of an endpoint. */
export interface In<E extends EndpointDef> {
  params: EndpointParams<E>;
  query: EndpointQuery<E>;
  body: EndpointBody<E>;
}

/** What a handler returns: the response schema's input type (validated + stripped on the way out). */
export type Out<E extends EndpointDef> = z.input<E['response']>;

function parsePart(schema: z.ZodType | undefined, value: unknown, part: string): unknown {
  if (!schema) return undefined;
  const result = schema.safeParse(value ?? (part === 'body' ? undefined : {}));
  if (!result.success) {
    throw validationError(
      result.error.issues.map((i) => ({
        path: [part, ...i.path.map(String)].join('.'),
        message: i.message,
      })),
    );
  }
  return result.data;
}

export function parseInput(endpoint: EndpointDef, req: FastifyRequest): In<EndpointDef> {
  return {
    params: parsePart(endpoint.params, req.params, 'params') as never,
    query: parsePart(endpoint.query, req.query, 'query') as never,
    body: parsePart(endpoint.body, req.body, 'body') as never,
  };
}

export const Input = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const meta = getEndpointMeta(ctx);
  if (!meta) throw new Error('@Input() used on a handler without @Endpoint()');
  return parseInput(meta.endpoint, ctx.switchToHttp().getRequest<FastifyRequest>());
});

// ---------- serialization helpers used by mappers ----------

export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;
export const OK = { ok: true } as const;
