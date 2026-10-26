import { Linking, Platform } from 'react-native';

/** Digits and a leading plus only, as dialers expect them. */
export function telUrl(number: string): string | null {
  const trimmed = number.trim();
  const digits = trimmed.replace(/[^0-9+]/g, '');
  const normalized = digits.startsWith('+')
    ? `+${digits.slice(1).replace(/\+/g, '')}`
    : digits.replace(/\+/g, '');
  return normalized.replace('+', '').length >= 3 ? `tel:${normalized}` : null;
}

/**
 * Starts a phone call. Resolves false when the device cannot place calls (tablets, web without
 * a tel: handler), so the caller can show the number instead.
 */
export async function callNumber(number: string): Promise<boolean> {
  const url = telUrl(number);
  if (!url) return false;
  try {
    if (Platform.OS !== 'web' && !(await Linking.canOpenURL(url))) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function openMail(email: string): Promise<boolean> {
  try {
    await Linking.openURL(`mailto:${email.trim()}`);
    return true;
  } catch {
    return false;
  }
}
