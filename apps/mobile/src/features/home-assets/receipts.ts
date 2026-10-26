import type { StoredFile } from '@fp/contracts';
import { Linking, Platform } from 'react-native';
import { downloadAndShare } from '@/features/files/file-transfer';
import { api } from '@/lib/api';

/** Opens a stored receipt: share sheet on the phone, a new tab on web. */
export async function openStoredFile(householdId: string, file: StoredFile): Promise<void> {
  if (Platform.OS === 'web') {
    const link = await api.storage.download({ params: { householdId, fileId: file.id } });
    await Linking.openURL(link.url);
    return;
  }
  await downloadAndShare(householdId, file);
}
