import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Saves a text file and opens the share sheet (web: browser download). */
export async function shareTextFile(
  name: string,
  content: string,
  mimeType: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    return;
  }
  const file = new File(Paths.cache, name.replace(/[/\\:*?"<>|]+/g, '_'));
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle: name,
      UTI: 'public.comma-separated-values-text',
    });
  }
}
