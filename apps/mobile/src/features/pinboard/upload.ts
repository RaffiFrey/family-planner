import type { StoredFile } from '@fp/contracts';
import { ensureRootFolder, type PickedFile, uploadToStorage } from '@/features/files/file-transfer';
import { api } from '@/lib/api';

export class AttachmentError extends Error {
  override name = 'AttachmentError';
}

const POLL_MS = 1000;
const MAX_POLLS = 60;

/** Polls the file until the virus scan and thumbnailing are done; throws when it was rejected. */
export async function waitUntilReady(
  householdId: string,
  fileId: string,
  getFile: (input: { params: { householdId: string; fileId: string } }) => Promise<StoredFile> = (
    input,
  ) => api.storage.getFile(input),
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
): Promise<StoredFile> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const file = await getFile({ params: { householdId, fileId } });
    if (file.status === 'ready') return file;
    if (file.status === 'infected' || file.status === 'failed')
      throw new AttachmentError(file.status);
    await sleep(POLL_MS);
  }
  throw new AttachmentError('timeout');
}

/** Upload into the "Pinnwand" folder and wait until the file may be attached. */
export async function uploadAttachment(
  householdId: string,
  folderName: string,
  file: PickedFile,
): Promise<StoredFile> {
  const folderId = await ensureRootFolder(householdId, folderName);
  const stored = await uploadToStorage(householdId, folderId, file);
  return stored.status === 'ready' ? stored : waitUntilReady(householdId, stored.id);
}
