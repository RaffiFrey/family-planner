import { z } from 'zod';
import { defineEndpoint, HouseholdParams, Id, IsoDateTime, Ok, withHousehold } from '../core.js';

const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);

/** Maximum sharing period; sharing always ends automatically. */
export const MAX_LOCATION_SHARE_MINUTES = 7 * 24 * 60;

export const LocationShare = z.object({
  memberId: Id,
  active: z.boolean(),
  /** null = everyone in the household with location access. */
  sharedWith: z.array(Id).nullable(),
  startedAt: IsoDateTime,
  until: IsoDateTime,
});
export type LocationShare = z.infer<typeof LocationShare>;

export const StartLocationShareBody = z.object({
  durationMinutes: z.number().int().min(5).max(MAX_LOCATION_SHARE_MINUTES),
  sharedWith: z.array(Id).min(1).max(20).nullable().default(null),
});

export const LocationPingBody = z.object({
  lat: Lat,
  lng: Lng,
  accuracyM: z.number().min(0).max(100_000),
  /** Device time of the fix; defaults to now. Must not be in the future or older than 1 h. */
  at: IsoDateTime.optional(),
});

export const LocationPingResult = z.object({
  ok: z.literal(true),
  /** Geofence transitions caused by this fix. */
  events: z.array(
    z.object({ placeId: Id, placeName: z.string(), event: z.enum(['arrived', 'left']) }),
  ),
});

export const MemberLocation = z.object({
  memberId: Id,
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number(),
  at: IsoDateTime,
  until: IsoDateTime,
  /** Places the member is currently at. */
  placeIds: z.array(Id),
});
export type MemberLocation = z.infer<typeof MemberLocation>;

export const LocationHistoryPoint = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number(),
  at: IsoDateTime,
});

export const GeoPlace = z.object({
  id: Id,
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  radiusM: z.number().int(),
  createdByMemberId: Id,
  createdAt: IsoDateTime,
});
export type GeoPlace = z.infer<typeof GeoPlace>;

const GeoPlaceBase = z.object({
  name: z.string().trim().min(1).max(100),
  lat: Lat,
  lng: Lng,
  radiusM: z.number().int().min(30).max(5000),
});
export const CreateGeoPlaceBody = GeoPlaceBase.extend({
  radiusM: GeoPlaceBase.shape.radiusM.default(100),
});
export const UpdateGeoPlaceBody = GeoPlaceBase.partial();

export const PlaceSubscription = z.object({
  id: Id,
  placeId: Id,
  /** null = any member who shares their location. */
  targetMemberId: Id.nullable(),
  createdAt: IsoDateTime,
});
export const CreatePlaceSubscriptionBody = z.object({
  targetMemberId: Id.nullable().default(null),
});

const tags = ['location'];
const base = '/v1/households/:householdId/location';
const PlaceParams = withHousehold({ placeId: Id });

export const locationContract = {
  myShare: defineEndpoint({
    method: 'GET',
    path: `${base}/share`,
    summary: 'My location sharing status (null when never started)',
    tags,
    params: HouseholdParams,
    response: LocationShare.nullable(),
  }),
  startSharing: defineEndpoint({
    method: 'PUT',
    path: `${base}/share`,
    summary: 'Opt in to sharing my location for a limited time',
    tags,
    params: HouseholdParams,
    body: StartLocationShareBody,
    response: LocationShare,
  }),
  stopSharing: defineEndpoint({
    method: 'DELETE',
    path: `${base}/share`,
    summary: 'Stop sharing and delete my location history',
    tags,
    params: HouseholdParams,
    response: Ok,
  }),
  ping: defineEndpoint({
    method: 'POST',
    path: `${base}/pings`,
    summary: 'Report my current position (only while sharing)',
    tags,
    params: HouseholdParams,
    body: LocationPingBody,
    response: LocationPingResult,
    status: 200,
  }),
  latest: defineEndpoint({
    method: 'GET',
    path: `${base}/members`,
    summary: 'Latest positions of members sharing with me',
    tags,
    params: HouseholdParams,
    response: z.array(MemberLocation),
  }),
  history: defineEndpoint({
    method: 'GET',
    path: `${base}/members/:memberId/history`,
    summary: 'Last 24 hours of a member sharing with me',
    tags,
    params: withHousehold({ memberId: Id }),
    response: z.array(LocationHistoryPoint),
  }),
  places: {
    list: defineEndpoint({
      method: 'GET',
      path: `${base}/places`,
      summary: 'Places (geofences)',
      tags,
      params: HouseholdParams,
      response: z.array(GeoPlace),
    }),
    create: defineEndpoint({
      method: 'POST',
      path: `${base}/places`,
      summary: 'Add a place',
      tags,
      params: HouseholdParams,
      body: CreateGeoPlaceBody,
      response: GeoPlace,
    }),
    update: defineEndpoint({
      method: 'PATCH',
      path: `${base}/places/:placeId`,
      summary: 'Update a place',
      tags,
      params: PlaceParams,
      body: UpdateGeoPlaceBody,
      response: GeoPlace,
    }),
    remove: defineEndpoint({
      method: 'DELETE',
      path: `${base}/places/:placeId`,
      summary: 'Delete a place',
      tags,
      params: PlaceParams,
      response: Ok,
    }),
  },
  subscriptions: {
    list: defineEndpoint({
      method: 'GET',
      path: `${base}/subscriptions`,
      summary: 'My arrival/departure subscriptions',
      tags,
      params: HouseholdParams,
      response: z.array(PlaceSubscription),
    }),
    create: defineEndpoint({
      method: 'POST',
      path: `${base}/places/:placeId/subscriptions`,
      summary: 'Get notified when someone arrives at or leaves a place',
      tags,
      params: PlaceParams,
      body: CreatePlaceSubscriptionBody,
      response: PlaceSubscription,
    }),
    remove: defineEndpoint({
      method: 'DELETE',
      path: `${base}/subscriptions/:subscriptionId`,
      summary: 'Unsubscribe',
      tags,
      params: withHousehold({ subscriptionId: Id }),
      response: Ok,
    }),
  },
} as const;
