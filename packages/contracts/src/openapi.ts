import { z } from 'zod';
import { type ContractTree, flattenContract, ProblemDetails } from './core.js';

type JsonSchema = Record<string, unknown>;

function toSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as JsonSchema;
  delete json.$schema;
  return json;
}

function objectProperties(schema: z.ZodObject): [string, z.ZodType, boolean][] {
  return Object.entries(schema.shape).map(([k, v]) => {
    const t = v as z.ZodType;
    return [k, t, !t.safeParse(undefined).success];
  });
}

export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
  servers?: { url: string; description?: string }[];
}

/** OpenAPI 3.1 document generated from a contract tree. */
export function generateOpenApi(contract: ContractTree, info: OpenApiInfo): JsonSchema {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [name, e] of flattenContract(contract)) {
    const path = e.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const parameters: unknown[] = [];
    if (e.params) {
      for (const [k, t] of objectProperties(e.params)) {
        parameters.push({ name: k, in: 'path', required: true, schema: toSchema(t, 'input') });
      }
    }
    if (e.query) {
      for (const [k, t, required] of objectProperties(e.query)) {
        parameters.push({ name: k, in: 'query', required, schema: toSchema(t, 'input') });
      }
    }
    const status = String(e.status ?? (e.method === 'POST' ? 201 : 200));
    const operation: Record<string, unknown> = {
      operationId: name,
      summary: e.summary,
      tags: e.tags ?? [name.split('.')[0]],
      parameters,
      responses: {
        [status]: {
          description: 'Success',
          content: { 'application/json': { schema: toSchema(e.response, 'output') } },
        },
        default: {
          description: 'Error (RFC 9457)',
          content: {
            'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
          },
        },
      },
    };
    if (e.body) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: toSchema(e.body, 'input') } },
      };
    }
    if (e.auth === 'public') operation.security = [];
    paths[path] ??= {};
    paths[path][e.method.toLowerCase()] = operation;
  }
  return {
    openapi: '3.1.0',
    info,
    servers: info.servers ?? [],
    paths,
    components: {
      schemas: { ProblemDetails: toSchema(ProblemDetails, 'output') },
      securitySchemes: {
        session: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token' },
        bearer: { type: 'http', scheme: 'bearer' },
      },
    },
    security: [{ session: [] }, { bearer: [] }],
  };
}
