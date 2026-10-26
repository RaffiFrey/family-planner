'use client';

import { type Module, MODULES } from '@fp/domain/permissions';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MODULE_NAV = {
  calendar: 'calendar',
  tasks: 'tasks',
  lists: 'lists',
  finance: 'finance',
  storage: 'storage',
  household: 'household',
  meals: 'meals',
  rewards: 'rewards',
  pinboard: 'pinboard',
  travel: 'travel',
  photos: 'photos',
  vault: 'vault',
  contacts: 'contacts',
  health: 'health',
  school: 'school',
  home: 'homeAssets',
  location: 'location',
  assistant: 'assistant',
} as const satisfies Record<Module, string>;

/** Caregiver access: which modules and until when. */
export function CaregiverAccessFields({
  modules,
  onModulesChange,
  accessUntil,
  onAccessUntilChange,
}: {
  modules: Module[];
  onModulesChange: (modules: Module[]) => void;
  /** `datetime-local` value */
  accessUntil: string;
  onAccessUntilChange: (value: string) => void;
}) {
  const t = useTranslations('settings.members');
  const tn = useTranslations('nav');
  const id = React.useId();
  return (
    <div className="grid gap-4 rounded-md border border-border p-3">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t('modules')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {MODULES.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${m}`}
                checked={modules.includes(m)}
                onCheckedChange={(checked) =>
                  onModulesChange(
                    checked === true ? [...modules, m] : modules.filter((x) => x !== m),
                  )
                }
              />
              <Label htmlFor={`${id}-${m}`} className="font-normal">
                {tn(MODULE_NAV[m])}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-until`}>{t('accessUntilLabel')}</Label>
        <Input
          id={`${id}-until`}
          type="datetime-local"
          value={accessUntil}
          onChange={(e) => onAccessUntilChange(e.target.value)}
        />
      </div>
    </div>
  );
}
