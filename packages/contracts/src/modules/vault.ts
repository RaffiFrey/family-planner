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

export const VaultDocumentType = z.enum([
  'id_card',
  'passport',
  'driver_license',
  'insurance_policy',
  'birth_certificate',
  'certificate',
  'contract',
  'medical',
  'tax',
  'other',
]);
export type VaultDocumentType = z.infer<typeof VaultDocumentType>;

export const VaultOcrStatus = z.enum([
  'none',
  'pending',
  'done',
  'unsupported',
  'failed',
  'disabled',
]);
export const VaultExpiryState = z.enum(['valid', 'expiring', 'expired', 'none']);

export const VaultSuggestion = z.object({
  value: z.string(),
  source: z.string(),
  confidence: z.number(),
});

/** Values found by OCR; the client offers them to the user instead of overwriting fields. */
export const VaultSuggestions = z.object({
  expiresAt: z.array(VaultSuggestion),
  issuedAt: z.array(VaultSuggestion),
  documentNumber: z.array(VaultSuggestion),
  holderName: z.string().nullable(),
});

export const VaultDocument = z.object({
  id: Id,
  type: VaultDocumentType,
  title: z.string(),
  holderMemberId: Id.nullable(),
  issuer: z.string().nullable(),
  /** Decrypted only on the single-document endpoint; null in lists and search results. */
  documentNumber: z.string().nullable(),
  documentNumberLast4: z.string().nullable(),
  issuedOn: LocalDate.nullable(),
  expiresOn: LocalDate.nullable(),
  expiryState: VaultExpiryState,
  notes: z.string().nullable(),
  fileIds: z.array(Id),
  tags: z.array(z.string()),
  reminderLeadDays: z.array(z.number().int()),
  visibility: Visibility,
  sharedWith: z.array(Id).nullable(),
  ownerMemberId: Id,
  ocrStatus: VaultOcrStatus,
  suggestions: VaultSuggestions.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type VaultDocument = z.infer<typeof VaultDocument>;

const VaultDocumentBase = z.object({
  type: VaultDocumentType,
  title: z.string().trim().min(1).max(200),
  holderMemberId: Id.nullable(),
  issuer: z.string().trim().max(200).nullable(),
  documentNumber: z.string().trim().min(1).max(100).nullable(),
  issuedOn: LocalDate.nullable(),
  expiresOn: LocalDate.nullable(),
  notes: z.string().max(5000).nullable(),
  fileIds: z.array(Id).max(20),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  /** Days before expiry to remind; default 183, 30 and 7. */
  reminderLeadDays: z.array(z.number().int().min(0).max(730)).max(5).nullable(),
  visibility: Visibility,
  sharedWith: z.array(Id).max(20).nullable(),
});

export const CreateVaultDocumentBody = VaultDocumentBase.extend({
  holderMemberId: VaultDocumentBase.shape.holderMemberId.optional(),
  issuer: VaultDocumentBase.shape.issuer.optional(),
  documentNumber: VaultDocumentBase.shape.documentNumber.optional(),
  issuedOn: VaultDocumentBase.shape.issuedOn.optional(),
  expiresOn: VaultDocumentBase.shape.expiresOn.optional(),
  notes: VaultDocumentBase.shape.notes.optional(),
  fileIds: VaultDocumentBase.shape.fileIds.default([]),
  tags: VaultDocumentBase.shape.tags.default([]),
  reminderLeadDays: VaultDocumentBase.shape.reminderLeadDays.optional(),
  visibility: VaultDocumentBase.shape.visibility.default('household'),
  sharedWith: VaultDocumentBase.shape.sharedWith.optional(),
});

export const UpdateVaultDocumentBody = VaultDocumentBase.partial();

export const VaultListQuery = z.object({
  holderMemberId: Id.optional(),
  type: VaultDocumentType.optional(),
  tag: z.string().optional(),
});

export const VaultExpiringQuery = z.object({
  /** Documents expiring within this many days (including already expired ones). */
  days: z.coerce.number().int().min(1).max(1095).default(183),
});

export const VaultSearchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const VaultSearchHit = z.object({
  document: VaultDocument,
  /** Snippet around the match (title, notes or OCR text). */
  snippet: z.string().nullable(),
  rank: z.number(),
});

const tags = ['vault'];
const base = '/v1/households/:householdId/vault';
const DocParams = withHousehold({ documentId: Id });

export const vaultContract = {
  list: defineEndpoint({
    method: 'GET',
    path: `${base}/documents`,
    summary: 'Vault documents (by holder/type/tag)',
    tags,
    params: HouseholdParams,
    query: VaultListQuery,
    response: z.array(VaultDocument),
  }),
  get: defineEndpoint({
    method: 'GET',
    path: `${base}/documents/:documentId`,
    summary: 'Vault document incl. decrypted document number',
    tags,
    params: DocParams,
    response: VaultDocument,
  }),
  create: defineEndpoint({
    method: 'POST',
    path: `${base}/documents`,
    summary: 'Add a vault document',
    tags,
    params: HouseholdParams,
    body: CreateVaultDocumentBody,
    response: VaultDocument,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: `${base}/documents/:documentId`,
    summary: 'Update a vault document',
    tags,
    params: DocParams,
    body: UpdateVaultDocumentBody,
    response: VaultDocument,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: `${base}/documents/:documentId`,
    summary: 'Delete a vault document (attached files are kept)',
    tags,
    params: DocParams,
    response: Ok,
  }),
  expiring: defineEndpoint({
    method: 'GET',
    path: `${base}/expiring`,
    summary: 'Documents expiring soon or expired',
    tags,
    params: HouseholdParams,
    query: VaultExpiringQuery,
    response: z.array(VaultDocument),
  }),
  search: defineEndpoint({
    method: 'GET',
    path: `${base}/search`,
    summary: 'Full-text search over title, issuer, notes and OCR text',
    tags,
    params: HouseholdParams,
    query: VaultSearchQuery,
    response: z.array(VaultSearchHit),
  }),
  runOcr: defineEndpoint({
    method: 'POST',
    path: `${base}/documents/:documentId/ocr`,
    summary: '(Re-)run text recognition on the attached files',
    tags,
    params: DocParams,
    response: VaultDocument,
    status: 202,
  }),
} as const;
