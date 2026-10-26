import { Text as RNText, type TextProps } from 'react-native';

type Variant = 'title' | 'heading' | 'subheading' | 'body' | 'caption' | 'label';

const VARIANTS: Record<Variant, string> = {
  title: 'text-3xl font-bold text-text',
  heading: 'text-xl font-semibold text-text',
  subheading: 'text-base font-semibold text-text',
  body: 'text-base text-text',
  caption: 'text-sm text-muted',
  label: 'text-sm font-medium text-text',
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  className?: string;
}

/** Text that scales with the system font size (dynamic type) up to a sane maximum. */
export function Text({
  variant = 'body',
  className,
  maxFontSizeMultiplier = 2,
  ...props
}: AppTextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      accessibilityRole={variant === 'title' || variant === 'heading' ? 'header' : undefined}
      className={`${VARIANTS[variant]} ${className ?? ''}`}
      {...props}
    />
  );
}
