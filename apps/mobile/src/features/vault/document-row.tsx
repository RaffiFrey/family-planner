import type { VaultDocument } from '@fp/contracts';
import { router } from 'expo-router';
import { ListRow } from '@/components/ui';
import { useMemberMap } from '@/features/household/household';
import { useColors } from '@/lib/theme';
import { ExpiryBadge, TYPE_ICONS, useTypeLabel } from './ui';

/** Vault list row: type icon tinted by expiry, holder, last digits, expiry badge. */
export function DocumentRow({ doc, snippet }: { doc: VaultDocument; snippet?: string | null }) {
  const colors = useColors();
  const typeLabel = useTypeLabel();
  const members = useMemberMap();
  const Icon = TYPE_ICONS[doc.type];
  const holder = doc.holderMemberId ? members.get(doc.holderMemberId)?.displayName : undefined;
  const subtitle = [
    typeLabel(doc.type),
    holder,
    doc.documentNumberLast4 ? `…${doc.documentNumberLast4}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      title={doc.title}
      subtitle={snippet ?? subtitle}
      left={
        <Icon
          size={22}
          color={
            doc.expiryState === 'expired'
              ? colors.danger
              : doc.expiryState === 'expiring'
                ? colors.warning
                : colors.primary
          }
        />
      }
      right={<ExpiryBadge doc={doc} />}
      chevron
      onPress={() => {
        router.push({ pathname: '/vault/[documentId]', params: { documentId: doc.id } });
      }}
    />
  );
}
