import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps, View } from 'react-native';
import { useColors } from '@/lib/theme';
import { Text } from './text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-surface-muted border border-border',
  ghost: 'bg-transparent',
  danger: 'bg-danger',
};
const LABEL: Record<Variant, string> = {
  primary: 'text-primary-text',
  secondary: 'text-text',
  ghost: 'text-primary',
  danger: 'text-primary-text',
};

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
  size?: 'md' | 'sm';
}

export function Button({
  title,
  variant = 'primary',
  loading,
  icon,
  disabled,
  className,
  size = 'md',
  ...props
}: ButtonProps) {
  const colors = useColors();
  const isDisabled = disabled === true || loading === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading === true }}
      disabled={isDisabled}
      className={`flex-row items-center justify-center rounded-md ${size === 'sm' ? 'min-h-9 px-3' : 'min-h-12 px-4'} ${CONTAINER[variant]} ${isDisabled ? 'opacity-50' : 'active:opacity-80'} ${className ?? ''}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'danger' ? colors.primaryText : colors.primary
          }
        />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon}
          <Text
            className={`font-semibold ${size === 'sm' ? 'text-sm' : 'text-base'} ${LABEL[variant]}`}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: Omit<PressableProps, 'children'> & { label: string; children: ReactNode; className?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className={`h-11 w-11 items-center justify-center rounded-full active:bg-surface-muted ${className ?? ''}`}
      {...props}
    >
      {children}
    </Pressable>
  );
}
