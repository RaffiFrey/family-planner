'use client';

import { apiQuery } from '@fp/api-client';
import type { Contact, ContactCategory } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookUser, Mail, MapPin, MoreVertical, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { MemberAvatarStack } from '@/components/member-avatar';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { ModuleGate } from '@/components/upsell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { CONTACT_CATEGORIES, ContactDialog } from './contact-dialog';
import { EmergencyCards } from './emergency-cards';

export function ContactsPage() {
  const t = useTranslations('contacts');
  return (
    <ModuleGate action="contacts.read">
      <PageHeader title={t('title')} description={t('description')} />
      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts">{t('tabs.contacts')}</TabsTrigger>
          <TabsTrigger value="emergency">{t('tabs.emergency')}</TabsTrigger>
        </TabsList>
        <TabsContent value="contacts">
          <ContactsList />
        </TabsContent>
        <TabsContent value="emergency">
          <EmergencyCards />
        </TabsContent>
      </Tabs>
    </ModuleGate>
  );
}

function ContactsList() {
  const t = useTranslations('contacts');
  const tc = useTranslations('common');
  const { householdId, can } = useHousehold();
  const canWrite = can('contacts.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState<ContactCategory | ''>('');
  const [dialog, setDialog] = React.useState<{ open: boolean; contact: Contact | null }>({
    open: false,
    contact: null,
  });
  const [deleting, setDeleting] = React.useState<Contact | null>(null);
  const query = useQuery(apiQuery(api, 'contacts', 'list', { params: { householdId } }));

  const remove = useMutation({
    mutationFn: (c: Contact) => api.contacts.remove({ params: { householdId, contactId: c.id } }),
    onMutate: async (c) => {
      const key = apiQuery(api, 'contacts', 'list', { params: { householdId } }).queryKey;
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Contact[]>(key);
      queryClient.setQueryData<Contact[]>(key, (old) => old?.filter((x) => x.id !== c.id));
      return { prev, key };
    },
    onError: (err, _c, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
      toastError(err);
    },
    onSuccess: () => {
      setDeleting(null);
      toast.success(t('deleted'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data ?? [])
      .filter((c) => !category || c.category === category)
      .filter(
        (c) =>
          !q ||
          [c.name, c.organization, c.notes, c.email, ...c.phones.map((p) => p.number)]
            .filter(Boolean)
            .some((s) => s?.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query.data, search, category]);

  const addButton = canWrite ? (
    <Button onClick={() => setDialog({ open: true, contact: null })}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={tc('search')}
          className="max-w-xs"
        />
        <NativeSelect
          value={category}
          onChange={(e) => setCategory(e.target.value as ContactCategory | '')}
          aria-label={t('fields.category')}
          className="w-auto"
        >
          <option value="">{t('allCategories')}</option>
          {CONTACT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`categories.${c}`)}
            </option>
          ))}
        </NativeSelect>
        <div className="ml-auto">{addButton}</div>
      </div>
      {query.isPending ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<BookUser />}
          title={t('empty')}
          description={t('emptyHint')}
          action={addButton}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title={t('noMatches')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <ContactCard
                contact={c}
                actions={
                  canWrite ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${tc('edit')}: ${c.name}`}
                        >
                          <MoreVertical aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ open: true, contact: c })}>
                          <Pencil aria-hidden />
                          {tc('edit')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(c)}>
                          <Trash2 aria-hidden />
                          {tc('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null
                }
              />
            </li>
          ))}
        </ul>
      )}
      <ContactDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        contact={dialog.contact}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle', { name: deleting?.name ?? '' })}
        description={t('deleteBody')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

export function ContactCard({ contact, actions }: { contact: Contact; actions?: React.ReactNode }) {
  const t = useTranslations('contacts');
  const { members } = useHousehold();
  const linked = members.filter((m) => contact.memberIds.includes(m.id));
  return (
    <Card className="h-full">
      <CardContent className="grid gap-2 pt-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{contact.name}</p>
            {contact.organization ? (
              <p className="truncate text-sm text-muted">{contact.organization}</p>
            ) : null}
          </div>
          <Badge variant="secondary">{t(`categories.${contact.category}`)}</Badge>
          {actions}
        </div>
        {contact.phones.length > 0 ? (
          <ul className="grid gap-1 text-sm">
            {contact.phones.map((p, i) => (
              <li key={i}>
                <a
                  href={`tel:${p.number.replace(/[^+0-9]/g, '')}`}
                  className="inline-flex items-center gap-2 rounded-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={t('call', { number: p.number })}
                >
                  <Phone className="size-3.5" aria-hidden />
                  <span className="tabular-nums">{p.number}</span>
                  {p.label ? <span className="text-muted">· {p.label}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {contact.email ? (
          <a
            href={`mailto:${contact.email}`}
            className="inline-flex items-center gap-2 truncate text-sm text-primary hover:underline"
            aria-label={t('mail', { email: contact.email })}
          >
            <Mail className="size-3.5" aria-hidden />
            {contact.email}
          </a>
        ) : null}
        {contact.address ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {contact.address}
          </p>
        ) : null}
        {contact.notes ? <p className="text-sm whitespace-pre-line">{contact.notes}</p> : null}
        {linked.length > 0 ? <MemberAvatarStack members={linked} size="xs" /> : null}
      </CardContent>
    </Card>
  );
}
