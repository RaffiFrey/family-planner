import { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Who may call an endpoint. Customer routes default to `user`; admin routes use `staff`. */
export type EndpointAuth = 'public' | 'user' | 'staff';

/**
 * A single API operation. Contracts are plain data: the API validates against them,
 * the OpenAPI document is generated from them and the typed client is derived from them (ADR-0005).
 */
export interface EndpointDef {
  method: HttpMethod;
  path: string;
  summary: string;
  tags?: readonly string[];
  auth?: EndpointAuth;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  response: z.ZodType;
  status?: number;
}

export type ContractTree = { readonly [key: string]: EndpointDef | ContractTree };

export function defineEndpoint<const E extends EndpointDef>(e: E): E {
  return e;
}

export function defineContract<const T extends ContractTree>(t: T): T {
  return t;
}

export function isEndpoint(v: EndpointDef | ContractTree): v is EndpointDef {
  return (
    typeof (v as EndpointDef).method === 'string' && typeof (v as EndpointDef).path === 'string'
  );
}

/** Flattens a contract tree into `[dotted.name, endpoint]` pairs. */
export function flattenContract(tree: ContractTree, prefix = ''): [string, EndpointDef][] {
  return Object.entries(tree).flatMap(([key, v]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    return isEndpoint(v) ? [[name, v] as [string, EndpointDef]] : flattenContract(v, name);
  });
}

// ---------- Typed inputs/outputs ----------

type ParamsInput<E> = E extends { params: infer P extends z.ZodType }
  ? { params: z.input<P> }
  : unknown;
type QueryInput<E> = E extends { query: infer Q extends z.ZodType }
  ? { query?: z.input<Q> }
  : unknown;
type BodyInput<E> = E extends { body: infer B extends z.ZodType } ? { body: z.input<B> } : unknown;

export type EndpointInput<E extends EndpointDef> = ParamsInput<E> & QueryInput<E> & BodyInput<E>;
export type EndpointOutput<E extends EndpointDef> = z.output<E['response']>;

export type EndpointBody<E extends EndpointDef> = E extends { body: infer B extends z.ZodType }
  ? z.output<B>
  : never;
export type EndpointQuery<E extends EndpointDef> = E extends { query: infer Q extends z.ZodType }
  ? z.output<Q>
  : never;
export type EndpointParams<E extends EndpointDef> = E extends { params: infer P extends z.ZodType }
  ? z.output<P>
  : never;

// ---------- Shared schemas ----------

export const Id = z.uuid();
export const IsoDateTime = z.iso.datetime({ offset: true });
export const LocalDate = z.iso.date();
export const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');
export const MinorAmount = z.number().int().refine(Number.isSafeInteger, 'Amount out of range');

export const Ok = z.object({ ok: z.literal(true) });

export const ProblemDetails = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetails>;

export const CursorQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function page<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const HouseholdParams = z.object({ householdId: Id });
export function withHousehold<T extends z.ZodRawShape>(shape: T) {
  return z.object({ householdId: Id, ...shape });
}
