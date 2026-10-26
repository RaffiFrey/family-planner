'use client';

import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';

export interface UploadItem {
  key: string;
  name: string;
  /** 0..100 */
  progress: number;
  status: 'uploading' | 'done' | 'error';
}

/** PUTs the bytes straight to object storage; XHR because fetch has no upload progress. */
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.withCredentials = false;
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new TypeError('Network error during upload'));
    xhr.send(file);
  });
}

export function useUploads(folderId: string | null) {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [items, setItems] = React.useState<UploadItem[]>([]);

  const patch = React.useCallback((key: string, update: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...update } : i)));
  }, []);

  const uploadOne = React.useCallback(
    async (file: File) => {
      const key = crypto.randomUUID();
      setItems((prev) => [...prev, { key, name: file.name, progress: 0, status: 'uploading' }]);
      try {
        const ticket = await api.storage.createUpload({
          params: { householdId },
          body: {
            folderId,
            name: file.name,
            sizeBytes: file.size,
            mimeType: file.type || 'application/octet-stream',
          },
        });
        await putWithProgress(ticket.uploadUrl, ticket.uploadHeaders, file, (progress) =>
          patch(key, { progress }),
        );
        await api.storage.completeUpload({ params: { householdId, fileId: ticket.file.id } });
        patch(key, { progress: 100, status: 'done' });
      } catch (err) {
        patch(key, { status: 'error' });
        toastError(err);
      }
    },
    [householdId, folderId, patch, toastError],
  );

  const upload = React.useCallback(
    async (files: File[]) => {
      const valid = files.filter((f) => f.size > 0);
      if (valid.length === 0) return;
      await Promise.all(valid.map(uploadOne));
      await queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
    [uploadOne, queryClient],
  );

  const clearFinished = React.useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status === 'uploading'));
  }, []);

  return { items, upload, clearFinished };
}
