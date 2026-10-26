'use client';

import { api } from '@/lib/api';

/**
 * Waits until freshly uploaded files (in the storage root) left the virus scan.
 * Returns the ids that are `ready`; ids still scanning after the timeout are left out.
 */
export async function waitUntilReady(
  householdId: string,
  ids: readonly string[],
  timeoutMs = 30_000,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const contents = await api.storage.browse({ params: { householdId }, query: {} });
    const files = contents.files.filter((f) => ids.includes(f.id));
    const pending = files.filter((f) => f.status === 'scanning' || f.status === 'pending_upload');
    if (pending.length === 0 || Date.now() > deadline)
      return files.filter((f) => f.status === 'ready').map((f) => f.id);
    await new Promise((r) => setTimeout(r, 1500));
  }
}
