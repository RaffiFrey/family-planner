import type { StoredFile } from '@fp/contracts';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { api } from '@/lib/api';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
}

function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/heic') return 'heic';
  return 'jpg';
}

/** Photo from the camera or library; null when cancelled or permission denied. */
export async function pickImage(source: 'camera' | 'library'): Promise<PickedFile | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const mimeType = asset.mimeType ?? 'image/jpeg';
  return {
    uri: asset.uri,
    name: asset.fileName ?? `IMG_${Date.now()}.${extensionFor(mimeType)}`,
    mimeType,
    size: asset.fileSize ?? null,
  };
}

export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    size: asset.size ?? null,
  };
}

/**
 * Upload flow: reserve quota + presigned URL (`createUpload`), PUT the bytes straight to object
 * storage, then `completeUpload` to trigger virus scan and thumbnails.
 */
export async function uploadToStorage(
  householdId: string,
  folderId: string | null,
  file: PickedFile,
): Promise<StoredFile> {
  const blob = await (await fetch(file.uri)).blob();
  const sizeBytes = file.size && file.size > 0 ? file.size : blob.size;
  const ticket = await api.storage.createUpload({
    params: { householdId },
    body: { folderId, name: file.name, sizeBytes, mimeType: file.mimeType },
  });
  const res = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.mimeType, ...ticket.uploadHeaders },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed with HTTP ${String(res.status)}`);
  return api.storage.completeUpload({ params: { householdId, fileId: ticket.file.id } });
}

/** Id of a root folder with the given name, created when missing (e.g. "Belege" for receipts). */
export async function ensureRootFolder(householdId: string, name: string): Promise<string> {
  const root = await api.storage.browse({ params: { householdId } });
  const existing = root.folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const created = await api.storage.createFolder({ params: { householdId }, body: { name } });
  return created.id;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'file';
}

/** Downloads through a short-lived URL into the cache and opens the share sheet. */
export async function downloadAndShare(householdId: string, file: StoredFile): Promise<void> {
  const link = await api.storage.download({ params: { householdId, fileId: file.id } });
  const target = new File(Paths.cache, safeFileName(file.name));
  const downloaded = await File.downloadFileAsync(link.url, target, { idempotent: true });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(downloaded.uri, { mimeType: file.mimeType, dialogTitle: file.name });
  }
}
