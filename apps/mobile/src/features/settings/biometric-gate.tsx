import * as LocalAuthentication from 'expo-local-authentication';
import { Lock } from 'lucide-react-native';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, View } from 'react-native';
import { create } from 'zustand';
import { Button, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { useSettings } from './settings-store';

interface LockState {
  unlocked: boolean;
  setUnlocked: (v: boolean) => void;
}

/** In-memory only: the lock re-engages whenever the app goes to the background. */
const useLockState = create<LockState>((set) => ({
  unlocked: false,
  setUnlocked: (unlocked) => {
    set({ unlocked });
  },
}));

AppState.addEventListener('change', (state) => {
  if (state === 'background') useLockState.getState().setUnlocked(false);
});

export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (
      (await LocalAuthentication.hasHardwareAsync()) &&
      (await LocalAuthentication.isEnrolledAsync())
    );
  } catch {
    return false;
  }
}

export async function authenticate(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason });
    return result.success;
  } catch {
    return false;
  }
}

/** Shows children only after Face ID / fingerprint when the biometric lock is enabled. */
export function BiometricGate({ children }: { children: ReactNode }) {
  const enabled = useSettings((s) => s.biometricLock);
  const unlocked = useLockState((s) => s.unlocked);
  const setUnlocked = useLockState((s) => s.setUnlocked);
  const { t } = useTranslation();
  const colors = useColors();
  const [busy, setBusy] = useState(false);

  const tryUnlock = useCallback(async () => {
    // Without enrolled biometrics the lock cannot work, so it must not lock people out.
    if (!(await biometricsAvailable()) || (await authenticate(t('m.settings.unlockReason'))))
      setUnlocked(true);
  }, [setUnlocked, t]);

  const unlock = async () => {
    setBusy(true);
    try {
      await tryUnlock();
    } finally {
      setBusy(false);
    }
  };

  const locked = enabled && !unlocked;
  useEffect(() => {
    if (locked) void tryUnlock();
  }, [locked, tryUnlock]);

  if (!locked) return <>{children}</>;
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-8">
      <Lock size={48} color={colors.textMuted} />
      <Text variant="heading" className="text-center">
        {t('m.settings.locked')}
      </Text>
      <Button title={t('m.settings.unlock')} loading={busy} onPress={() => void unlock()} />
    </View>
  );
}
