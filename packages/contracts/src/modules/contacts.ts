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
import { HexColor } from './households.js';

export const ContactCategory = z.enum([
  'doctor',
  'school',
  'kita',
  'babysitter',
  'family',
  'emergency',
  'craftsman',
  'other',
]);
export type ContactCategory = z.infer<typeof ContactCategory>;

export const ContactPhone = z.object({
  label: z.string().trim().max(40).nullable().default(null),
  number: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[+0-9 ()/.-]+$/, 'Invalid phone number'),
});

export const Contact = z.object({
  id: Id,
  name: z.string(),
  category: ContactCategory,
  organization: z.string().nullable(),
  phones: z.array(z.object({ label: z.string().nullable(), number: z.string() })),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  /** Members this contact belongs to (e.g. the child's pediatrician). */
  memberIds: z.array(Id),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Contact = z.infer<typeof Contact>;

const ContactBase = z.object({
  name: z.string().trim().min(1).max(200),
  category: ContactCategory,
  organization: z.string().trim().max(200).nullable(),
  phones: z.array(ContactPhone).max(10),
  email: z.email().nullable(),
  address: z.string().trim().max(500).nullable(),
  notes: z.string().max(5000).nullable(),
  memberIds: z.array(Id).max(20),
});

export const CreateContactBody = ContactBase.extend({
  category: ContactBase.shape.category.default('other'),
  organization: ContactBase.shape.organization.optional(),
  phones: ContactBase.shape.phones.default([]),
  email: ContactBase.shape.email.optional(),
  address: ContactBase.shape.address.optional(),
  notes: ContactBase.shape.notes.optional(),
  memberIds: ContactBase.shape.memberIds.default([]),
});
export const UpdateContactBody = ContactBase.partial();

export const ContactListQuery = z.object({
  category: ContactCategory.optional(),
  memberId: Id.optional(),
  q: z.string().trim().max(100).optional(),
});

export const BloodType = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-', 'unknown']);

export const EmergencyCard = z.object({
  memberId: Id,
  bloodType: BloodType.nullable(),
  allergies: z.array(z.string()),
  conditions: z.array(z.string()),
  medications: z.string().nullable(),
  insuranceProvider: z.string().nullable(),
  /** Only in clear for the card's member and members with health access; otherwise null. */
  insuranceNumber: z.string().nullable(),
  insuranceNumberLast4: z.string().nullable(),
  emergencyContactIds: z.array(Id),
  doctorContactId: Id.nullable(),
  notes: z.string().nullable(),
  updatedAt: IsoDateTime,
});
export type EmergencyCard = z.infer<typeof EmergencyCard>;

export const UpsertEmergencyCardBody = z.object({
  bloodType: BloodType.nullable().optional(),
  allergies: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  conditions: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  medications: z.string().max(2000).nullable().optional(),
  insuranceProvider: z.string().trim().max(200).nullable().optional(),
  insuranceNumber: z.string().trim().min(1).max(50).nullable().optional(),
  emergencyContactIds: z.array(Id).max(10).optional(),
  doctorContactId: Id.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** Self-contained emergency data for one member, meant to be cached offline on the device. */
export const EmergencySummary = z.object({
  member: z.object({
    id: Id,
    displayName: z.string(),
    birthday: LocalDate.nullable(),
    color: HexColor,
  }),
  card: EmergencyCard.nullable(),
  doctor: Contact.nullable(),
  emergencyContacts: z.array(Contact),
  generatedAt: IsoDateTime,
  /** Content hash; clients skip re-rendering/storing when unchanged. */
  version: z.string(),
  /** Suggested time before refreshing the offline copy. */
  maxAgeSeconds: z.number().int(),
});
export type EmergencySummary = z.infer<typeof EmergencySummary>;

const tags = ['contacts'];
const base = '/v1/households/:householdId/contacts';
const ContactParams = withHousehold({ contactId: Id });
const MemberParams = withHousehold({ memberId: Id });

export const contactsContract = {
  list: defineEndpoint({
    method: 'GET',
    path: base,
    summary: 'Family address book',
    tags,
    params: HouseholdParams,
    query: ContactListQuery,
    response: z.array(Contact),
  }),
  get: defineEndpoint({
    method: 'GET',
    path: `${base}/:contactId`,
    summary: 'Contact',
    tags,
    params: ContactParams,
    response: Contact,
  }),
  create: defineEndpoint({
    method: 'POST',
    path: base,
    summary: 'Add a contact',
    tags,
    params: HouseholdParams,
    body: CreateContactBody,
    response: Contact,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: `${base}/:contactId`,
    summary: 'Update a contact',
    tags,
    params: ContactParams,
    body: UpdateContactBody,
    response: Contact,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: `${base}/:contactId`,
    summary: 'Delete a contact',
    tags,
    params: ContactParams,
    response: Ok,
  }),
  emergency: {
    list: defineEndpoint({
      method: 'GET',
      path: '/v1/households/:householdId/emergency-cards',
      summary: 'Emergency cards of all members',
      tags,
      params: HouseholdParams,
      response: z.array(EmergencyCard),
    }),
    get: defineEndpoint({
      method: 'GET',
      path: '/v1/households/:householdId/emergency-cards/:memberId',
      summary: 'Emergency card of a member',
      tags,
      params: MemberParams,
      response: EmergencyCard,
    }),
    upsert: defineEndpoint({
      method: 'PUT',
      path: '/v1/households/:householdId/emergency-cards/:memberId',
      summary: 'Create or update the emergency card of a member',
      tags,
      params: MemberParams,
      body: UpsertEmergencyCardBody,
      response: EmergencyCard,
    }),
    remove: defineEndpoint({
      method: 'DELETE',
      path: '/v1/households/:householdId/emergency-cards/:memberId',
      summary: 'Delete the emergency card of a member',
      tags,
      params: MemberParams,
      response: Ok,
    }),
    summary: defineEndpoint({
      method: 'GET',
      path: '/v1/households/:householdId/emergency-cards/:memberId/summary',
      summary: 'Offline emergency summary (card + resolved contacts)',
      tags,
      params: MemberParams,
      response: EmergencySummary,
    }),
  },
} as const;
