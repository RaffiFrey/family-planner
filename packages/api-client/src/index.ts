import {
  apiContract,
  type ApiContract,
  type ClientOptions,
  type ContractClient,
  createClient,
  type EndpointDef,
  type EntityChanged,
  type EndpointInput,
  type EndpointOutput,
  RealtimeEvents,
} from '@fp/contracts';
import { io, type Socket } from 'socket.io-client';

export type Api = ContractClient<ApiContract>;
export type ApiModule = keyof ApiContract;
export type ApiEndpoint<M extends ApiModule> = keyof ApiContract[M] & string;

type EndpointOf<
  M extends ApiModule,
  E extends ApiEndpoint<M>,
> = ApiContract[M][E] extends infer D extends EndpointDef ? D : never;

export type Input<M extends ApiModule, E extends ApiEndpoint<M>> = EndpointInput<EndpointOf<M, E>>;
export type Output<M extends ApiModule, E extends ApiEndpoint<M>> = EndpointOutput<
  EndpointOf<M, E>
>;

export function createApi(options: ClientOptions): Api {
  return createClient(apiContract, options);
}

/**
 * Query keys are `[module, endpoint, input]`, so a realtime change can invalidate a whole
 * module (`['finance']`) without knowing every query that depends on it.
 */
export function queryKey<M extends ApiModule, E extends ApiEndpoint<M>>(
  module: M,
  endpoint: E,
  input?: Input<M, E>,
): readonly [M, E, Input<M, E> | undefined] {
  return [module, endpoint, input] as const;
}

type Callable = (input?: unknown) => Promise<unknown>;

/** `{ queryKey, queryFn }` for TanStack Query's useQuery/useSuspenseQuery/prefetchQuery. */
export function apiQuery<M extends ApiModule, E extends ApiEndpoint<M>>(
  api: Api,
  module: M,
  endpoint: E,
  input?: Input<M, E>,
): { queryKey: readonly [M, E, Input<M, E> | undefined]; queryFn: () => Promise<Output<M, E>> } {
  const fn = (api[module] as unknown as Record<string, Callable>)[endpoint] as Callable;
  return {
    queryKey: queryKey(module, endpoint, input),
    queryFn: () => fn(input) as Promise<Output<M, E>>,
  };
}

const ENTITY_MODULES: Record<EntityChanged['entity'], readonly ApiModule[]> = {
  household: ['households'],
  member: ['households', 'tasks', 'calendar'],
  calendar: ['calendar'],
  event: ['calendar'],
  task: ['tasks'],
  list: ['lists'],
  list_item: ['lists'],
  account: ['finance'],
  transaction: ['finance'],
  category: ['finance'],
  budget: ['finance'],
  rule: ['finance'],
  folder: ['storage'],
  file: ['storage'],
  notification: ['notifications'],
  fin_contract: ['financePlus'],
  goal: ['financePlus'],
  shared_expense: ['financePlus'],
  bank_connection: ['financePlus', 'finance'],
  recipe: ['meals'],
  meal_plan: ['meals', 'lists'],
  reward: ['rewards'],
  points: ['rewards'],
  post: ['pinboard'],
  poll: ['pinboard'],
  trip: ['travel'],
  album: ['photos', 'storage'],
  document: ['vault', 'storage'],
  contact: ['contacts'],
  emergency_card: ['contacts'],
  health_record: ['health'],
  medication: ['health'],
  timetable: ['school'],
  asset: ['home'],
  maintenance: ['home', 'tasks'],
  meter_reading: ['home'],
  location: ['location'],
  place: ['location'],
  assistant: ['assistant'],
  calendar_subscription: ['calendarSync', 'calendar'],
};

/** Query-key prefixes to invalidate when an entity changes. */
export function invalidationKeys(change: Pick<EntityChanged, 'entity'>): (readonly [ApiModule])[] {
  return ENTITY_MODULES[change.entity].map((m) => [m] as const);
}

export interface RealtimeOptions {
  url: string;
  /** Mobile passes the session cookie explicitly; browsers send it automatically. */
  headers?: Record<string, string>;
  onEntityChanged: (change: EntityChanged) => void;
  onNotification?: (n: unknown) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface RealtimeConnection {
  socket: Socket;
  subscribe: (householdId: string) => void;
  close: () => void;
}

/** Socket.IO connection that joins household rooms and forwards change events. */
export function connectRealtime(options: RealtimeOptions): RealtimeConnection {
  const socket = io(options.url, {
    path: '/realtime',
    withCredentials: true,
    transports: ['websocket'],
    ...(options.headers ? { extraHeaders: options.headers } : {}),
    ...(options.headers?.cookie ? { auth: { cookie: options.headers.cookie } } : {}),
  });
  const rooms = new Set<string>();
  socket.on('connect', () => {
    options.onConnectionChange?.(true);
    // Re-join after reconnects.
    for (const id of rooms) socket.emit(RealtimeEvents.subscribe, { householdId: id });
  });
  socket.on('disconnect', () => options.onConnectionChange?.(false));
  socket.on(RealtimeEvents.entityChanged, (change: EntityChanged) => {
    options.onEntityChanged(change);
  });
  socket.on(RealtimeEvents.notification, (n: unknown) => options.onNotification?.(n));
  return {
    socket,
    subscribe: (householdId) => {
      rooms.add(householdId);
      if (socket.connected) socket.emit(RealtimeEvents.subscribe, { householdId });
    },
    close: () => {
      socket.close();
    },
  };
}

export { ApiError } from '@fp/contracts';
