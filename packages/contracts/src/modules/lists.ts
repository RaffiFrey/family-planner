import { z } from 'zod';
import { defineEndpoint, HouseholdParams, Id, IsoDateTime, Ok, withHousehold } from '../core.js';
import { Visibility } from './calendar.js';

export const ListKind = z.enum(['shopping', 'todo', 'packing', 'wishlist', 'other']);

/** Store sections used to sort shopping lists like the walk through a supermarket. */
export const ITEM_CATEGORIES = [
  'produce',
  'bakery',
  'dairy',
  'meat',
  'frozen',
  'pantry',
  'drinks',
  'household',
  'hygiene',
  'baby',
  'pets',
  'other',
] as const;
export const ItemCategory = z.enum(ITEM_CATEGORIES);

export const ListItem = z.object({
  id: Id,
  listId: Id,
  text: z.string(),
  quantity: z.string().nullable(),
  category: ItemCategory,
  checked: z.boolean(),
  checkedByMemberId: Id.nullable(),
  checkedAt: IsoDateTime.nullable(),
  position: z.number(),
});
export type ListItem = z.infer<typeof ListItem>;

export const List = z.object({
  id: Id,
  name: z.string(),
  kind: ListKind,
  icon: z.string().nullable(),
  visibility: Visibility,
  ownerMemberId: Id,
  openCount: z.number().int(),
  updatedAt: IsoDateTime,
});
export type List = z.infer<typeof List>;

export const ListWithItems = List.extend({ items: z.array(ListItem) });

export const CreateListBody = z.object({
  name: z.string().trim().min(1).max(80),
  kind: ListKind.default('shopping'),
  icon: z.string().max(32).nullable().optional(),
  visibility: Visibility.default('household'),
});
export const UpdateListBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: ListKind,
    icon: z.string().max(32).nullable(),
    visibility: Visibility,
  })
  .partial();

export const CreateItemBody = z.object({
  text: z.string().trim().min(1).max(200),
  quantity: z.string().max(40).nullable().optional(),
  /** Guessed from the text / history when omitted. */
  category: ItemCategory.optional(),
});
export const UpdateItemBody = z
  .object({
    text: z.string().trim().min(1).max(200),
    quantity: z.string().max(40).nullable(),
    category: ItemCategory,
    checked: z.boolean(),
    position: z.number(),
  })
  .partial();

export const Suggestion = z.object({
  text: z.string(),
  category: ItemCategory,
  uses: z.number().int(),
});

const tags = ['lists'];
const ListParams = withHousehold({ listId: Id });
const ItemParams = withHousehold({ listId: Id, itemId: Id });

export const listsContract = {
  list: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/lists',
    summary: 'Lists',
    tags,
    params: HouseholdParams,
    response: z.array(List),
  }),
  get: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/lists/:listId',
    summary: 'List with items',
    tags,
    params: ListParams,
    response: ListWithItems,
  }),
  create: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/lists',
    summary: 'Create list',
    tags,
    params: HouseholdParams,
    body: CreateListBody,
    response: List,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/lists/:listId',
    summary: 'Update list',
    tags,
    params: ListParams,
    body: UpdateListBody,
    response: List,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/lists/:listId',
    summary: 'Delete list',
    tags,
    params: ListParams,
    response: Ok,
  }),
  addItem: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/lists/:listId/items',
    summary: 'Add item',
    tags,
    params: ListParams,
    body: CreateItemBody,
    response: ListItem,
  }),
  updateItem: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/lists/:listId/items/:itemId',
    summary: 'Update/check item',
    tags,
    params: ItemParams,
    body: UpdateItemBody,
    response: ListItem,
  }),
  removeItem: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/lists/:listId/items/:itemId',
    summary: 'Remove item',
    tags,
    params: ItemParams,
    response: Ok,
  }),
  clearChecked: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/lists/:listId/clear-checked',
    summary: 'Remove checked items',
    tags,
    params: ListParams,
    response: z.object({ removed: z.number().int() }),
    status: 200,
  }),
  suggestions: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/lists/suggestions',
    summary: 'Quick-add suggestions from history',
    tags,
    params: HouseholdParams,
    query: z.object({ q: z.string().max(100).default('') }),
    response: z.array(Suggestion),
  }),
} as const;
