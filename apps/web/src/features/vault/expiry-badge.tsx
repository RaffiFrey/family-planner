'use client';

import type { VaultDocument } from '@fp/contracts';
import { AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { noon } from '@/features/travel/utils';
import { useFormat } from '@/lib/use-format';

export function ExpiryBadge({ doc }: { doc: Pick<VaultDocument, 'expiryState' | 'expiresOn'> }) {
  const t = useTranslations('vault.expiry');
  const fmt = useFormat();
  if (!doc.expiresOn || doc.expiryState === 'none') {
    return <Badge variant="outline">{t('none')}</Badge>;
  }
  const date = fmt.date(noon(doc.expiresOn));
  switch (doc.expiryState) {
    case 'expired':
      return (
        <Badge variant="danger">
          <AlertTriangle aria-hidden />
          {t('expired', { date })}
        </Badge>
      );
    case 'expiring':
      return (
        <Badge variant="warning">
          <CalendarClock aria-hidden />
          {t('expiring', { date })}
        </Badge>
      );
    default:
      return (
        <Badge variant="success">
          <CheckCircle2 aria-hidden />
          {t('valid', { date })}
        </Badge>
      );
  }
}
