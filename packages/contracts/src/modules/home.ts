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
import { RRuleString } from './calendar.js';

export const HomeAssetKind = z.enum(['home', 'vehicle', 'appliance', 'other']);

export const HomeAsset = z.object({
  id: Id,
  kind: HomeAssetKind,
  name: z.string(),
  /** Free key/value details, e.g. plate, vin, model, serial. */
  details: z.record(z.string(), z.string()),
  purchaseDate: LocalDate.nullable(),
  warrantyUntil: LocalDate.nullable(),
  receiptFileIds: z.array(Id),
  transactionId: Id.nullable(),
  notes: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type HomeAsset = z.infer<typeof HomeAsset>;

const HomeAssetBase = z.object({
  kind: HomeAssetKind,
  name: z.string().trim().min(1).max(200),
  details: z
    .record(z.string().min(1).max(40), z.string().max(200))
    .refine((d) => Object.keys(d).length <= 30, 'Too many details'),
  purchaseDate: LocalDate.nullable(),
  warrantyUntil: LocalDate.nullable(),
  receiptFileIds: z.array(Id).max(20),
  transactionId: Id.nullable(),
  notes: z.string().max(5000).nullable(),
});
export const CreateHomeAssetBody = HomeAssetBase.extend({
  details: HomeAssetBase.shape.details.default({}),
  purchaseDate: HomeAssetBase.shape.purchaseDate.optional(),
  warrantyUntil: HomeAssetBase.shape.warrantyUntil.optional(),
  receiptFileIds: HomeAssetBase.shape.receiptFileIds.default([]),
  transactionId: HomeAssetBase.shape.transactionId.optional(),
  notes: HomeAssetBase.shape.notes.optional(),
});
export const UpdateHomeAssetBody = HomeAssetBase.partial();
export const HomeAssetQuery = z.object({ kind: HomeAssetKind.optional() });

export const MaintenanceRecurrence = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('interval'), months: z.number().int().min(1).max(240) }),
  z.object({ mode: z.literal('rrule'), rrule: RRuleString }),
]);

export const MaintenanceTemplate = z.object({
  key: z.string(),
  title: z.string(),
  assetKinds: z.array(HomeAssetKind),
  recurrence: MaintenanceRecurrence,
  leadDays: z.number().int(),
});

export const MaintenancePlan = z.object({
  id: Id,
  assetId: Id,
  title: z.string(),
  templateKey: z.string().nullable(),
  recurrence: MaintenanceRecurrence,
  nextDueOn: LocalDate.nullable(),
  leadDays: z.number().int(),
  lastDoneOn: LocalDate.nullable(),
  assigneeMemberId: Id.nullable(),
  notes: z.string().nullable(),
  status: z.enum(['ok', 'upcoming', 'due', 'ended']),
  createdAt: IsoDateTime,
});
export type MaintenancePlan = z.infer<typeof MaintenancePlan>;

export const CreateMaintenancePlanBody = z
  .object({
    assetId: Id,
    /** Built-in template (title, recurrence and lead days default from it). */
    templateKey: z.string().max(40).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    recurrence: MaintenanceRecurrence.optional(),
    /** First due date; defaults from the recurrence. */
    nextDueOn: LocalDate.optional(),
    leadDays: z.number().int().min(0).max(365).optional(),
    assigneeMemberId: Id.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((b) => b.templateKey ?? (b.title && b.recurrence), {
    message: 'Either templateKey or title and recurrence are required',
    path: ['templateKey'],
  });
export const UpdateMaintenancePlanBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  recurrence: MaintenanceRecurrence.optional(),
  nextDueOn: LocalDate.nullable().optional(),
  leadDays: z.number().int().min(0).max(365).optional(),
  assigneeMemberId: Id.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export const MaintenancePlanQuery = z.object({
  assetId: Id.optional(),
  dueBefore: LocalDate.optional(),
});

export const MaintenanceLog = z.object({
  id: Id,
  planId: Id,
  doneOn: LocalDate,
  dueOn: LocalDate.nullable(),
  costMinor: MinorAmount.nullable(),
  notes: z.string().nullable(),
  memberId: Id.nullable(),
  createdAt: IsoDateTime,
});
export const CompleteMaintenanceBody = z.object({
  doneOn: LocalDate.optional(),
  costMinor: MinorAmount.min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export const CompleteMaintenanceResult = z.object({ plan: MaintenancePlan, log: MaintenanceLog });

export const MeterType = z.enum(['electricity', 'gas', 'water', 'heating', 'mileage', 'other']);
const MeterValue = z.string().regex(/^\d{1,12}(\.\d{1,3})?$/, 'Decimal with up to 3 places');

export const MeterReading = z.object({
  id: Id,
  assetId: Id,
  meterType: MeterType,
  value: z.string(),
  unit: z.string(),
  readAt: IsoDateTime,
  note: z.string().nullable(),
  createdAt: IsoDateTime,
});
export const CreateMeterReadingBody = z.object({
  meterType: MeterType,
  value: MeterValue,
  unit: z.string().trim().min(1).max(20),
  readAt: IsoDateTime.optional(),
  note: z.string().max(500).nullable().optional(),
});
export const MeterReadingQuery = z.object({ meterType: MeterType.optional() });

export const ConsumptionQuery = z.object({
  meterType: MeterType,
  period: z.enum(['month', 'year']).default('month'),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
});
export const ConsumptionStats = z.object({
  meterType: MeterType,
  unit: z.string().nullable(),
  intervals: z.array(
    z.object({
      from: IsoDateTime,
      to: IsoDateTime,
      days: z.number(),
      consumption: z.string(),
      perDay: z.string(),
      reset: z.boolean(),
    }),
  ),
  periods: z.array(
    z.object({ period: z.string(), consumption: z.string(), days: z.number(), perDay: z.string() }),
  ),
  total: z.string(),
  days: z.number(),
  avgPerDay: z.string().nullable(),
});

export const WarrantyQuery = z.object({
  days: z.coerce.number().int().min(1).max(1095).default(90),
});

const tags = ['home'];
const base = '/v1/households/:householdId/home';
const AssetParams = withHousehold({ assetId: Id });
const PlanParams = withHousehold({ planId: Id });

export const homeContract = {
  assets: {
    list: defineEndpoint({
      method: 'GET',
      path: `${base}/assets`,
      summary: 'Homes, vehicles and appliances',
      tags,
      params: HouseholdParams,
      query: HomeAssetQuery,
      response: z.array(HomeAsset),
    }),
    get: defineEndpoint({
      method: 'GET',
      path: `${base}/assets/:assetId`,
      summary: 'Asset',
      tags,
      params: AssetParams,
      response: HomeAsset,
    }),
    create: defineEndpoint({
      method: 'POST',
      path: `${base}/assets`,
      summary: 'Add an asset',
      tags,
      params: HouseholdParams,
      body: CreateHomeAssetBody,
      response: HomeAsset,
    }),
    update: defineEndpoint({
      method: 'PATCH',
      path: `${base}/assets/:assetId`,
      summary: 'Update an asset',
      tags,
      params: AssetParams,
      body: UpdateHomeAssetBody,
      response: HomeAsset,
    }),
    remove: defineEndpoint({
      method: 'DELETE',
      path: `${base}/assets/:assetId`,
      summary: 'Delete an asset with its plans and readings',
      tags,
      params: AssetParams,
      response: Ok,
    }),
    warranties: defineEndpoint({
      method: 'GET',
      path: `${base}/warranties`,
      summary: 'Assets whose warranty ends within the given days',
      tags,
      params: HouseholdParams,
      query: WarrantyQuery,
      response: z.array(HomeAsset),
    }),
  },
  maintenance: {
    templates: defineEndpoint({
      method: 'GET',
      path: `${base}/maintenance-templates`,
      summary: 'Built-in maintenance templates (HU, tyres, smoke detectors, boiler)',
      tags,
      params: HouseholdParams,
      response: z.array(MaintenanceTemplate),
    }),
    list: defineEndpoint({
      method: 'GET',
      path: `${base}/maintenance`,
      summary: 'Maintenance plans',
      tags,
      params: HouseholdParams,
      query: MaintenancePlanQuery,
      response: z.array(MaintenancePlan),
    }),
    create: defineEndpoint({
      method: 'POST',
      path: `${base}/maintenance`,
      summary: 'Add a maintenance plan',
      tags,
      params: HouseholdParams,
      body: CreateMaintenancePlanBody,
      response: MaintenancePlan,
    }),
    update: defineEndpoint({
      method: 'PATCH',
      path: `${base}/maintenance/:planId`,
      summary: 'Update a maintenance plan',
      tags,
      params: PlanParams,
      body: UpdateMaintenancePlanBody,
      response: MaintenancePlan,
    }),
    remove: defineEndpoint({
      method: 'DELETE',
      path: `${base}/maintenance/:planId`,
      summary: 'Delete a maintenance plan',
      tags,
      params: PlanParams,
      response: Ok,
    }),
    complete: defineEndpoint({
      method: 'POST',
      path: `${base}/maintenance/:planId/complete`,
      summary: 'Log a completion; schedules the next due date',
      tags,
      params: PlanParams,
      body: CompleteMaintenanceBody,
      response: CompleteMaintenanceResult,
    }),
    logs: defineEndpoint({
      method: 'GET',
      path: `${base}/maintenance/:planId/logs`,
      summary: 'Completion log',
      tags,
      params: PlanParams,
      response: z.array(MaintenanceLog),
    }),
  },
  meters: {
    list: defineEndpoint({
      method: 'GET',
      path: `${base}/assets/:assetId/readings`,
      summary: 'Meter readings of an asset',
      tags,
      params: AssetParams,
      query: MeterReadingQuery,
      response: z.array(MeterReading),
    }),
    create: defineEndpoint({
      method: 'POST',
      path: `${base}/assets/:assetId/readings`,
      summary: 'Record a meter reading',
      tags,
      params: AssetParams,
      body: CreateMeterReadingBody,
      response: MeterReading,
    }),
    remove: defineEndpoint({
      method: 'DELETE',
      path: `${base}/readings/:readingId`,
      summary: 'Delete a meter reading',
      tags,
      params: withHousehold({ readingId: Id }),
      response: Ok,
    }),
    consumption: defineEndpoint({
      method: 'GET',
      path: `${base}/assets/:assetId/consumption`,
      summary: 'Consumption per period and average per day',
      tags,
      params: AssetParams,
      query: ConsumptionQuery,
      response: ConsumptionStats,
    }),
  },
} as const;
