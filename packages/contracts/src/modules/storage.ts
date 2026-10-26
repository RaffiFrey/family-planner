import { z } from 'zod';
import { defineEndpoint, HouseholdParams, Id, IsoDateTime, Ok, withHousehold } from '../core.js';
import { Visibility } from './calendar.js';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB per file

export const Folder = z.object({
  id: Id,
  parentId: Id.nullable(),
  name: z.string(),
  visibility: Visibility,
  ownerMemberId: Id,
  createdAt: IsoDateTime,
});
export type Folder = z.infer<typeof Folder>;

export const FileStatus = z.enum(['pending_upload', 'scanning', 'ready', 'infected', 'failed']);

export const StoredFile = z.object({
  id: Id,
  folderId: Id.nullable(),
  name: z.string(),
  sizeBytes: z.number().int(),
  mimeType: z.string(),
  status: FileStatus,
  hasThumbnail: z.boolean(),
  visibility: Visibility,
  ownerMemberId: Id,
  createdAt: IsoDateTime,
});
export type StoredFile = z.infer<typeof StoredFile>;

export const FolderContents = z.object({
  folder: Folder.nullable(),
  breadcrumbs: z.array(Folder.pick({ id: true, name: true })),
  folders: z.array(Folder),
  files: z.array(StoredFile),
});

export const CreateFolderBody = z.object({
  parentId: Id.nullable().default(null),
  name: z.string().trim().min(1).max(120),
  visibility: Visibility.default('household'),
});
export const UpdateFolderBody = z
  .object({
    parentId: Id.nullable(),
    name: z.string().trim().min(1).max(120),
    visibility: Visibility,
  })
  .partial();

export const CreateUploadBody = z.object({
  folderId: Id.nullable().default(null),
  name: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  mimeType: z.string().min(3).max(127),
  visibility: Visibility.default('household'),
});
export const UploadTicket = z.object({
  file: StoredFile,
  /** Presigned PUT URL; the client uploads the bytes directly to object storage. */
  uploadUrl: z.url(),
  uploadHeaders: z.record(z.string(), z.string()),
  expiresAt: IsoDateTime,
});
export const UpdateFileBody = z
  .object({
    folderId: Id.nullable(),
    name: z.string().trim().min(1).max(255),
    visibility: Visibility,
  })
  .partial();
export const DownloadLink = z.object({ url: z.url(), expiresAt: IsoDateTime });
export const Usage = z.object({
  usedBytes: z.number().int(),
  quotaBytes: z.number().int(),
  fileCount: z.number().int(),
});

const tags = ['storage'];
const FileParams = withHousehold({ fileId: Id });
const FolderParams = withHousehold({ folderId: Id });
const base = '/v1/households/:householdId/storage';

export const storageContract = {
  browse: defineEndpoint({
    method: 'GET',
    path: `${base}/browse`,
    summary: 'Folder contents (root when no folderId)',
    tags,
    params: HouseholdParams,
    query: z.object({ folderId: Id.optional() }),
    response: FolderContents,
  }),
  createFolder: defineEndpoint({
    method: 'POST',
    path: `${base}/folders`,
    summary: 'Create folder',
    tags,
    params: HouseholdParams,
    body: CreateFolderBody,
    response: Folder,
  }),
  updateFolder: defineEndpoint({
    method: 'PATCH',
    path: `${base}/folders/:folderId`,
    summary: 'Rename/move folder',
    tags,
    params: FolderParams,
    body: UpdateFolderBody,
    response: Folder,
  }),
  deleteFolder: defineEndpoint({
    method: 'DELETE',
    path: `${base}/folders/:folderId`,
    summary: 'Delete folder recursively',
    tags,
    params: FolderParams,
    response: Ok,
  }),
  createUpload: defineEndpoint({
    method: 'POST',
    path: `${base}/uploads`,
    summary: 'Reserve quota and get a presigned upload URL',
    tags,
    params: HouseholdParams,
    body: CreateUploadBody,
    response: UploadTicket,
  }),
  completeUpload: defineEndpoint({
    method: 'POST',
    path: `${base}/files/:fileId/complete`,
    summary: 'Confirm upload; triggers scan and thumbnails',
    tags,
    params: FileParams,
    response: StoredFile,
    status: 200,
  }),
  getFile: defineEndpoint({
    method: 'GET',
    path: `${base}/files/:fileId`,
    summary: 'File metadata and processing status',
    tags,
    params: FileParams,
    response: StoredFile,
  }),
  updateFile: defineEndpoint({
    method: 'PATCH',
    path: `${base}/files/:fileId`,
    summary: 'Rename/move file',
    tags,
    params: FileParams,
    body: UpdateFileBody,
    response: StoredFile,
  }),
  deleteFile: defineEndpoint({
    method: 'DELETE',
    path: `${base}/files/:fileId`,
    summary: 'Delete file',
    tags,
    params: FileParams,
    response: Ok,
  }),
  download: defineEndpoint({
    method: 'GET',
    path: `${base}/files/:fileId/download`,
    summary: 'Short-lived download URL',
    tags,
    params: FileParams,
    query: z.object({ thumbnail: z.stringbool().default(false) }),
    response: DownloadLink,
  }),
  usage: defineEndpoint({
    method: 'GET',
    path: `${base}/usage`,
    summary: 'Storage usage and quota',
    tags,
    params: HouseholdParams,
    response: Usage,
  }),
} as const;
