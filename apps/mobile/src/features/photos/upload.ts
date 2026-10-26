import type { StoredFile } from '@fp/contracts';
import { ensureRootFolder, type PickedFile, uploadToStorage } from '@/features/files/file-transfer';
import { api } from '@/lib/api';

/** Waits until a freshly uploaded file left the virus scan; null when not ready in time. */
export async function waitUntilReady(
  householdId: string,
  fileId: string,
  timeoutMs = 30_000,
): Promise<StoredFile | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const file = await api.storage.getFile({ params: { householdId, fileId } });
    if (file.status === 'ready') return file;
    if (file.status !== 'scanning' && file.status !== 'pending_upload') return null;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** Uploads a picked image into a named root folder and waits for the scan; null if not ready. */
export async function uploadAndWait(
  householdId: string,
  folderName: string,
  file: PickedFile,
): Promise<StoredFile | null> {
  const folderId = await ensureRootFolder(householdId, folderName);
  const stored = await uploadToStorage(householdId, folderId, file);
  if (stored.status === 'ready') return stored;
  return waitUntilReady(householdId, stored.id);
}
