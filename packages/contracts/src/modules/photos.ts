import { z } from 'zod';
import {
  defineEndpoint,
  HouseholdParams,
  Id,
  IsoDateTime,
  LocalDate,
  Ok,
  withHousehold,
} from '../core.js';
import { Visibility } from './calendar.js';

export const AlbumItem = z.object({
  id: Id,
  albumId: Id,
  fileId: Id,
  fileName: z.string(),
  mimeType: z.string(),
  caption: z.string().nullable(),
  takenAt: IsoDateTime.nullable(),
  position: z.number(),
  addedByMemberId: Id,
  createdAt: IsoDateTime,
});
export type AlbumItem = z.infer<typeof AlbumItem>;

export const Album = z.object({
  id: Id,
  title: z.string(),
  description: z.string().nullable(),
  coverFileId: Id.nullable(),
  visibility: Visibility,
  sharedWith: z.array(Id),
  ownerMemberId: Id,
  itemCount: z.number().int(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Album = z.infer<typeof Album>;

export const AlbumDetail = Album.extend({ items: z.array(AlbumItem) });

const AlbumBase = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable(),
  coverFileId: Id.nullable(),
  visibility: Visibility,
  sharedWith: z.array(Id).max(30),
});
export const CreateAlbumBody = AlbumBase.extend({
  description: AlbumBase.shape.description.default(null),
  coverFileId: AlbumBase.shape.coverFileId.default(null),
  visibility: AlbumBase.shape.visibility.default('household'),
  sharedWith: AlbumBase.shape.sharedWith.default([]),
});
export const UpdateAlbumBody = AlbumBase.partial();

export const AddAlbumItemsBody = z.object({
  items: z
    .array(
      z.object({
        fileId: Id,
        caption: z.string().max(500).nullable().default(null),
        /** Defaults to the upload time. */
        takenAt: IsoDateTime.nullable().default(null),
      }),
    )
    .min(1)
    .max(200),
});
export const UpdateAlbumItemBody = z
  .object({ caption: z.string().max(500).nullable(), takenAt: IsoDateTime.nullable() })
  .partial();
export const ReorderAlbumBody = z.object({ itemIds: z.array(Id).min(1).max(5000) });

export const MemoriesQuery = z.object({
  /** Defaults to today in the household time zone. */
  date: LocalDate.optional(),
});
export const Memory = z.object({
  year: z.number().int(),
  yearsAgo: z.number().int(),
  items: z.array(AlbumItem),
});

const tags = ['photos'];
const AlbumParams = withHousehold({ albumId: Id });
const ItemParams = withHousehold({ albumId: Id, itemId: Id });

export const photosContract = {
  list: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/photos/albums',
    summary: 'Albums',
    tags,
    params: HouseholdParams,
    response: z.array(Album),
  }),
  get: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/photos/albums/:albumId',
    summary: 'Album with items',
    tags,
    params: AlbumParams,
    response: AlbumDetail,
  }),
  create: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/photos/albums',
    summary: 'Create an album',
    tags,
    params: HouseholdParams,
    body: CreateAlbumBody,
    response: Album,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/photos/albums/:albumId',
    summary: 'Update an album',
    tags,
    params: AlbumParams,
    body: UpdateAlbumBody,
    response: Album,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/photos/albums/:albumId',
    summary: 'Delete an album (files stay in storage)',
    tags,
    params: AlbumParams,
    response: Ok,
  }),
  addItems: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/photos/albums/:albumId/items',
    summary: 'Add ready image/video files to an album',
    tags,
    params: AlbumParams,
    body: AddAlbumItemsBody,
    response: z.array(AlbumItem),
  }),
  updateItem: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/photos/albums/:albumId/items/:itemId',
    summary: 'Update caption or date',
    tags,
    params: ItemParams,
    body: UpdateAlbumItemBody,
    response: AlbumItem,
  }),
  removeItem: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/photos/albums/:albumId/items/:itemId',
    summary: 'Remove from the album (the file stays)',
    tags,
    params: ItemParams,
    response: Ok,
  }),
  reorder: defineEndpoint({
    method: 'PUT',
    path: '/v1/households/:householdId/photos/albums/:albumId/order',
    summary: 'Reorder album items',
    tags,
    params: AlbumParams,
    body: ReorderAlbumBody,
    response: z.array(AlbumItem),
  }),
  memories: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/photos/memories',
    summary: '"On this day": photos from the same date in previous years',
    tags,
    params: HouseholdParams,
    query: MemoriesQuery,
    response: z.array(Memory),
  }),
} as const;
