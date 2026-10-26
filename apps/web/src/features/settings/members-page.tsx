'use client';

import type { Member } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Baby, LogOut, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { AddChildDialog, EditMemberDialog } from './member-dialogs';
import { Section } from './section';

export function MembersPage() {
  const t = useTranslations('settings.members');
  const tr = useTranslations('roles');
  const tu = useTranslations('ui');
  const { householdId, members, member: self, can } = useHousehold();
  const fmt = useFormat();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [editing, setEditing] = React.useState<Member | null>(null);
  const [removing, setRemoving] = React.useState<Member | null>(null);
  const [addChild, setAddChild] = React.useState(false);
  const canManage = can('members.manage');
  const [now] = React.useState(() => Date.now());

  const remove = useMutation({
    mutationFn: (m: Member) =>
      api.households.removeMember({ params: { householdId, memberId: m.id } }),
    onSuccess: async (_data, m) => {
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      if (m.id === self.id) router.push('/');
    },
    onError: toastError,
  });

  const sorted = [...members].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const removingSelf = removing?.id === self.id;

  return (
    <Section
      title={t('title')}
      description={t('description')}
      actions={
        canManage ? (
          <Button variant="secondary" onClick={() => setAddChild(true)}>
            <Baby aria-hidden />
            {t('addChild')}
          </Button>
        ) : null
      }
    >
      <ul className="divide-y divide-border">
        {sorted.map((m) => {
          const isSelf = m.id === self.id;
          const editable = isSelf || (canManage && m.role !== 'owner');
          const removable = isSelf ? m.role !== 'owner' : canManage && m.role !== 'owner';
          const expired = m.accessUntil ? new Date(m.accessUntil).getTime() < now : false;
          return (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <MemberAvatar member={m} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{m.displayName}</span>
                  {isSelf ? <Badge variant="outline">{t('you')}</Badge> : null}
                  {m.isManaged ? <Badge variant="secondary">{t('managed')}</Badge> : null}
                </div>
                <div className="flex flex-wrap gap-x-2 text-sm text-muted">
                  <span>{tr(m.role)}</span>
                  {m.accessUntil ? (
                    <span className={expired ? 'text-danger' : undefined}>
                      ·{' '}
                      {expired
                        ? t('expired')
                        : t('accessUntil', { date: fmt.dateTime(m.accessUntil) })}
                    </span>
                  ) : null}
                </div>
              </div>
              {editable || removable ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${tu('actions')}: ${m.displayName}`}
                    >
                      <MoreVertical aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {editable ? (
                      <DropdownMenuItem onSelect={() => setEditing(m)}>
                        <Pencil aria-hidden />
                        {t('edit')}
                      </DropdownMenuItem>
                    ) : null}
                    {removable ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(m)}>
                          {isSelf ? <LogOut aria-hidden /> : <Trash2 aria-hidden />}
                          {isSelf ? t('leave') : t('remove')}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          );
        })}
      </ul>

      <EditMemberDialog target={editing} onClose={() => setEditing(null)} />
      <AddChildDialog open={addChild} onOpenChange={setAddChild} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={
          removingSelf ? t('leaveTitle') : t('removeTitle', { name: removing?.displayName ?? '' })
        }
        description={
          removingSelf ? t('leaveBody') : t('removeBody', { name: removing?.displayName ?? '' })
        }
        confirmLabel={removingSelf ? t('leave') : t('remove')}
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </Section>
  );
}
