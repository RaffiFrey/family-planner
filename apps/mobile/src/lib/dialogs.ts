import type { TFunction } from 'i18next';
import { Alert, Platform } from 'react-native';
import { errorMessage } from './errors';

/**
 * Confirmation dialog that also works in the web build (react-native-web's Alert ignores buttons).
 * Resolves true when the user confirms.
 */
export function confirmAsync(
  title: string,
  message: string | undefined,
  options: { confirmLabel: string; cancelLabel: string; destructive?: boolean },
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(text));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        {
          text: options.cancelLabel,
          style: 'cancel',
          onPress: () => {
            resolve(false);
          },
        },
        {
          text: options.confirmLabel,
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => {
            resolve(true);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          resolve(false);
        },
      },
    );
  });
}

/** Simple notice (web: window.alert). */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Shows an API error to the user. */
export function showError(e: unknown, t: TFunction): void {
  notify(t('common.unknownError'), errorMessage(e, t));
}
