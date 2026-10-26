import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  View,
} from 'react-native';
import { errorMessage } from '@/lib/errors';
import { useColors } from '@/lib/theme';
import { Button } from './button';
import { Text } from './text';

/** Scrollable screen body with consistent padding; keyboard-aware for forms. */
export function ScreenScroll({
  children,
  className,
  ...props
}: ScrollViewProps & { children: ReactNode; className?: string }) {
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName={`gap-4 p-4 pb-12 ${className ?? ''}`}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        {...props}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View className={`gap-2 rounded-lg border border-border bg-surface p-4 ${className ?? ''}`}>
      {children}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between pt-2">
      <Text variant="subheading" accessibilityRole="header">
        {title}
      </Text>
      {action}
    </View>
  );
}

export function LoadingView() {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View
      className="flex-1 items-center justify-center bg-background p-8"
      accessibilityLabel={t('common.loading')}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View className="items-center gap-2 px-6 py-10">
      <Text variant="subheading" className="text-center">
        {title ?? t('common.empty')}
      </Text>
      {message ? (
        <Text variant="caption" className="text-center">
          {message}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="items-center gap-3 px-6 py-10" accessibilityLiveRegion="polite">
      <Text className="text-center text-danger">{errorMessage(error, t)}</Text>
      {onRetry ? <Button title={t('common.retry')} variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

const TONES = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

export function ProgressBar({
  ratio,
  tone = 'primary',
  label,
}: {
  ratio: number;
  tone?: keyof typeof TONES;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <View
      className="h-2 overflow-hidden rounded-full bg-surface-muted"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <View className={`h-2 rounded-full ${TONES[tone]}`} style={{ width: `${pct}%` }} />
    </View>
  );
}
