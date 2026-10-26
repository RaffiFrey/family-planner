import { Platform } from 'react-native';

/** The Android emulator reaches the host machine through 10.0.2.2, not localhost. */
const fallbackUrl = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';

// Accessed literally so Expo can inline it at build time (typed only once expo-env.d.ts is generated).
const configuredUrl: unknown = process.env.EXPO_PUBLIC_API_URL;

export const API_URL: string = (
  typeof configuredUrl === 'string' && configuredUrl !== '' ? configuredUrl : fallbackUrl
).replace(/\/$/, '');

export const APP_SCHEME = 'familyplaner';

const configuredWebUrl: unknown = process.env.EXPO_PUBLIC_WEB_URL;

/** Web app (billing, OAuth flows that need a browser). */
export const WEB_URL: string = (
  typeof configuredWebUrl === 'string' && configuredWebUrl !== ''
    ? configuredWebUrl
    : 'https://app.familyplaner.de'
).replace(/\/$/, '');
