'use client';

import type { Member } from '@fp/contracts';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { PageHeader } from '@/components/states';
import { ModuleGate } from '@/components/upsell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHousehold } from '@/features/household/household-context';
import { cn } from '@/lib/utils';
import { CheckupsPanel } from './checkups';
import { MedicationsPanel } from './medications';
import { VaccinationsPanel } from './vaccinations';

export function HealthPage() {
  const t = useTranslations('health');
  const { members, member: me } = useHousehold();
  const [memberId, setMemberId] = React.useState(me.id);
  const selected = members.find((m) => m.id === memberId) ?? me;

  return (
    <ModuleGate action="health.read">
      <PageHeader title={t('title')} description={t('description')} />
      <MemberSwitcher
        label={t('member')}
        members={members}
        value={selected.id}
        onChange={setMemberId}
      />
      <Tabs defaultValue="vaccinations" className="mt-4">
        <TabsList>
          <TabsTrigger value="vaccinations">{t('tabs.vaccinations')}</TabsTrigger>
          <TabsTrigger value="medications">{t('tabs.medications')}</TabsTrigger>
          <TabsTrigger value="checkups">{t('tabs.checkups')}</TabsTrigger>
        </TabsList>
        <TabsContent value="vaccinations">
          <VaccinationsPanel member={selected} />
        </TabsContent>
        <TabsContent value="medications">
          <MedicationsPanel member={selected} />
        </TabsContent>
        <TabsContent value="checkups">
          <CheckupsPanel member={selected} />
        </TabsContent>
      </Tabs>
    </ModuleGate>
  );
}

/** Single-select member chips (radio group semantics). */
export function MemberSwitcher({
  label,
  members,
  value,
  onChange,
}: {
  label: string;
  members: Member[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {members.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.id)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary',
              active
                ? 'border-primary bg-primary/10 font-medium'
                : 'border-border bg-background hover:bg-surface-muted',
            )}
          >
            <MemberAvatar member={m} size="xs" />
            {m.displayName}
          </button>
        );
      })}
    </div>
  );
}
