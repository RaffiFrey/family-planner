import { z } from 'zod';
import {
  defineEndpoint,
  HouseholdParams,
  Id,
  IsoDateTime,
  LocalDate,
  MinorAmount,
  Ok,
  withHousehold,
} from '../core.js';
import { List } from './lists.js';

export const TripBudget = z.object({
  budgetMinor: MinorAmount.nullable(),
  /** Net spending of transactions tagged with `financeTag` (or `trip:<id>`), plus the linked category during the trip. */
  spentMinor: MinorAmount,
  remainingMinor: MinorAmount.nullable(),
  currency: z.string(),
  transactionCount: z.number().int(),
});

export const Trip = z.object({
  id: Id,
  name: z.string(),
  destination: z.string().nullable(),
  startDate: LocalDate,
  endDate: LocalDate,
  budgetMinor: MinorAmount.nullable(),
  currency: z.string(),
  financeCategoryId: Id.nullable(),
  financeAccountId: Id.nullable(),
  memberIds: z.array(Id),
  packingListId: Id.nullable(),
  notes: z.string().nullable(),
  /** Tag to put on finance transactions that belong to this trip. */
  financeTag: z.string(),
  createdByMemberId: Id,
  createdAt: IsoDateTime,
});
export type Trip = z.infer<typeof Trip>;

export const TRIP_ITEM_KINDS = ['flight', 'train', 'car', 'hotel', 'activity', 'note'] as const;
export const TripItemKind = z.enum(TRIP_ITEM_KINDS);

export const TripItem = z.object({
  id: Id,
  tripId: Id,
  kind: TripItemKind,
  title: z.string(),
  startAt: IsoDateTime.nullable(),
  endAt: IsoDateTime.nullable(),
  location: z.string().nullable(),
  confirmationCode: z.string().nullable(),
  notes: z.string().nullable(),
  attachmentFileIds: z.array(Id),
  createdAt: IsoDateTime,
});
export type TripItem = z.infer<typeof TripItem>;

export const TripDetail = Trip.extend({
  items: z.array(TripItem),
  /** Null for members without finance access (children). */
  budget: TripBudget.nullable(),
});

const TripBase = z.object({
  name: z.string().trim().min(1).max(200),
  destination: z.string().trim().max(200).nullable(),
  startDate: LocalDate,
  endDate: LocalDate,
  budgetMinor: MinorAmount.refine((n) => n >= 0, 'Must not be negative').nullable(),
  currency: z.string().length(3).toUpperCase(),
  financeCategoryId: Id.nullable(),
  financeAccountId: Id.nullable(),
  memberIds: z.array(Id).max(30),
  notes: z.string().max(5000).nullable(),
});
export const CreateTripBody = TripBase.extend({
  destination: TripBase.shape.destination.default(null),
  budgetMinor: TripBase.shape.budgetMinor.default(null),
  /** Defaults to the household currency. */
  currency: TripBase.shape.currency.optional(),
  financeCategoryId: TripBase.shape.financeCategoryId.default(null),
  financeAccountId: TripBase.shape.financeAccountId.default(null),
  memberIds: TripBase.shape.memberIds.default([]),
  notes: TripBase.shape.notes.default(null),
}).refine((t) => t.startDate <= t.endDate, {
  message: 'The trip must end after it starts',
  path: ['endDate'],
});
export const UpdateTripBody = TripBase.partial();

export const TripListQuery = z.object({
  when: z.enum(['upcoming', 'past', 'all']).default('all'),
});

const TripItemBase = z.object({
  kind: TripItemKind,
  title: z.string().trim().min(1).max(200),
  startAt: IsoDateTime.nullable(),
  endAt: IsoDateTime.nullable(),
  location: z.string().trim().max(300).nullable(),
  confirmationCode: z.string().trim().max(100).nullable(),
  notes: z.string().max(5000).nullable(),
  attachmentFileIds: z.array(Id).max(10),
});
export const CreateTripItemBody = TripItemBase.extend({
  startAt: TripItemBase.shape.startAt.default(null),
  endAt: TripItemBase.shape.endAt.default(null),
  location: TripItemBase.shape.location.default(null),
  confirmationCode: TripItemBase.shape.confirmationCode.default(null),
  notes: TripItemBase.shape.notes.default(null),
  attachmentFileIds: TripItemBase.shape.attachmentFileIds.default([]),
}).refine((i) => !i.startAt || !i.endAt || i.startAt <= i.endAt, {
  message: 'End must be after start',
  path: ['endAt'],
});
export const UpdateTripItemBody = TripItemBase.partial();

export const PACKING_TEMPLATE_KEYS = ['basics', 'beach', 'city', 'ski', 'camping', 'baby'] as const;
export const PackingTemplateKey = z.enum(PACKING_TEMPLATE_KEYS);
export const PackingTemplatesQuery = z.object({ locale: z.enum(['de', 'en']).optional() });

export const CreatePackingListBody = z.object({
  templates: z.array(PackingTemplateKey).max(6).default([]),
  /** Defaults to the household locale. */
  locale: z.enum(['de', 'en']).optional(),
  /** Name of a newly created list; items are appended when the trip already has a packing list. */
  listName: z.string().trim().min(1).max(120).optional(),
});
export const PackingListResult = z.object({ list: List, added: z.number().int() });

const tags = ['travel'];
const TripParams = withHousehold({ tripId: Id });
const ItemParams = withHousehold({ tripId: Id, itemId: Id });

export const travelContract = {
  list: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/travel/trips',
    summary: 'Trips',
    tags,
    params: HouseholdParams,
    query: TripListQuery,
    response: z.array(Trip),
  }),
  get: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/travel/trips/:tripId',
    summary: 'Trip with itinerary and budget',
    tags,
    params: TripParams,
    response: TripDetail,
  }),
  create: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/travel/trips',
    summary: 'Plan a trip',
    tags,
    params: HouseholdParams,
    body: CreateTripBody,
    response: Trip,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/travel/trips/:tripId',
    summary: 'Update a trip',
    tags,
    params: TripParams,
    body: UpdateTripBody,
    response: Trip,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/travel/trips/:tripId',
    summary: 'Delete a trip (the packing list stays)',
    tags,
    params: TripParams,
    response: Ok,
  }),
  addItem: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/travel/trips/:tripId/items',
    summary: 'Add an itinerary item',
    tags,
    params: TripParams,
    body: CreateTripItemBody,
    response: TripItem,
  }),
  updateItem: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/travel/trips/:tripId/items/:itemId',
    summary: 'Update an itinerary item',
    tags,
    params: ItemParams,
    body: UpdateTripItemBody,
    response: TripItem,
  }),
  removeItem: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/travel/trips/:tripId/items/:itemId',
    summary: 'Remove an itinerary item',
    tags,
    params: ItemParams,
    response: Ok,
  }),
  budget: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/travel/trips/:tripId/budget',
    summary: 'Trip budget vs. tagged finance transactions',
    tags,
    params: TripParams,
    response: TripBudget,
  }),
  packingTemplates: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/travel/packing-templates',
    summary: 'Built-in packing list templates',
    tags,
    params: HouseholdParams,
    query: PackingTemplatesQuery,
    response: z.array(z.object({ key: PackingTemplateKey, name: z.string() })),
  }),
  createPackingList: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/travel/trips/:tripId/packing-list',
    summary: 'Create (or extend) the trip packing list from templates',
    tags,
    params: TripParams,
    body: CreatePackingListBody,
    response: PackingListResult,
  }),
} as const;
