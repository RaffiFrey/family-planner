'use client';

import type { StoredFile } from '@fp/contracts';
import { api } from '@/lib/api';

/** PUTs bytes straight to object storage; XHR because fetch has no upload progress. */
export function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: Blob,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.withCredentials = false;
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new TypeError('Network error during upload'));
    xhr.send(file);
  });
}

/**
 * Uploads one file into household storage (ticket -> PUT -> complete) and returns the stored
 * file. The file may still be `scanning` afterwards; callers that need `ready` should poll.
 */
export async function uploadToStorage(
  householdId: string,
  file: File,
  options: {
    folderId?: string | null;
    visibility?: 'household' | 'private' | 'members';
    onProgress?: (pct: number) => void;
  } = {},
): Promise<StoredFile> {
  const ticket = await api.storage.createUpload({
    params: { householdId },
    body: {
      folderId: options.folderId ?? null,
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
      ...(options.visibility ? { visibility: options.visibility } : {}),
    },
  });
  await putWithProgress(ticket.uploadUrl, ticket.uploadHeaders, file, options.onProgress);
  return api.storage.completeUpload({ params: { householdId, fileId: ticket.file.id } });
}

/** Short-lived download URL for a stored file (optionally its thumbnail). */
export async function fileUrl(
  householdId: string,
  fileId: string,
  thumbnail = false,
): Promise<string> {
  const res = await api.storage.download({
    params: { householdId, fileId },
    query: { thumbnail: thumbnail ? 'true' : 'false' },
  });
  return res.url;
}
