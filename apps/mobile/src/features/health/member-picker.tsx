import type { Member } from '@fp/contracts';
import { useTranslation } from 'react-i18next';
import { ChipSelect } from '@/components/ui';

/** Horizontal member chips (health, school). */
export function MemberPicker({
  members,
  value,
  onChange,
}: {
  members: readonly Member[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ChipSelect
      scroll
      label={t('m.health.member')}
      options={members.map((m) => ({ value: m.id, label: m.displayName, color: m.color }))}
      value={value}
      onChange={onChange}
    />
  );
}
