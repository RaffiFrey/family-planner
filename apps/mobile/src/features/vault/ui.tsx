import type { VaultDocument, VaultDocumentType } from '@fp/contracts';
import {
  Award,
  Baby,
  BookOpen,
  Car,
  File,
  FilePen,
  IdCard,
  type LucideIcon,
  Receipt,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { useIntlLocale } from '@/i18n';
import { daysUntil, EXPIRY_TONE, parseLocalDate } from './expiry';

export const VAULT_TYPES: readonly VaultDocumentType[] = [
  'id_card',
  'passport',
  'driver_license',
  'insurance_policy',
  'birth_certificate',
  'certificate',
  'contract',
  'medical',
  'tax',
  'other',
];

export const TYPE_ICONS: Record<VaultDocumentType, LucideIcon> = {
  id_card: IdCard,
  passport: BookOpen,
  driver_license: Car,
  insurance_policy: ShieldCheck,
  birth_certificate: Baby,
  certificate: Award,
  contract: FilePen,
  medical: Stethoscope,
  tax: Receipt,
  other: File,
};

/** Translated label of a document type. */
export function useTypeLabel(): (type: VaultDocumentType) => string {
  const { t } = useTranslation();
  const labels: Record<VaultDocumentType, string> = {
    id_card: t('m.vault.types.id_card'),
    passport: t('m.vault.types.passport'),
    driver_license: t('m.vault.types.driver_license'),
    insurance_policy: t('m.vault.types.insurance_policy'),
    birth_certificate: t('m.vault.types.birth_certificate'),
    certificate: t('m.vault.types.certificate'),
    contract: t('m.vault.types.contract'),
    medical: t('m.vault.types.medical'),
    tax: t('m.vault.types.tax'),
    other: t('m.vault.types.other'),
  };
  return (type) => labels[type];
}

export function useFormatLocalDate(): (value: string) => string {
  const locale = useIntlLocale();
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  return (value) => fmt.format(parseLocalDate(value));
}

const BADGE: Record<(typeof EXPIRY_TONE)[keyof typeof EXPIRY_TONE], string> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  success: 'bg-success',
  muted: 'bg-surface-muted',
};

/** "Abgelaufen" / "Läuft in 12 Tagen ab" / "Gültig bis …" pill. */
export function ExpiryBadge({ doc }: { doc: Pick<VaultDocument, 'expiresOn' | 'expiryState'> }) {
  const { t } = useTranslation();
  const formatDate = useFormatLocalDate();
  if (!doc.expiresOn || doc.expiryState === 'none') return null;
  const days = daysUntil(doc.expiresOn);
  const label =
    doc.expiryState === 'expired'
      ? t('m.vault.expiredOn', { date: formatDate(doc.expiresOn) })
      : doc.expiryState === 'expiring'
        ? days === 0
          ? t('m.vault.expiresToday')
          : t('m.vault.expiresInDays', { count: days })
        : t('m.vault.validUntil', { date: formatDate(doc.expiresOn) });
  const tone = EXPIRY_TONE[doc.expiryState];
  return (
    <View
      className={`self-start rounded-full px-2 py-0.5 ${BADGE[tone]}`}
      accessible
      accessibilityLabel={label}
    >
      <Text
        className={`text-xs font-semibold ${tone === 'success' || tone === 'danger' || tone === 'warning' ? 'text-white' : 'text-text'}`}
      >
        {label}
      </Text>
    </View>
  );
}
