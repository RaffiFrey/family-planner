'use client';

import { ApiError, apiQuery, type Output } from '@fp/api-client';
import type { StoredFile, VaultDocument } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  FolderOpen,
  MoreVertical,
  Pencil,
  ScanText,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FeatureGate, ModuleGate, UpsellState } from '@/components/upsell';
import { FilePickerDialog } from '@/features/photos/file-picker';
import { waitUntilReady } from '@/features/photos/wait-ready';
import { useHousehold } from '@/features/household/household-context';
import { noon } from '@/features/travel/utils';
import { api } from '@/lib/api';
import { useFeature } from '@/lib/entitlements';
import { useToastError } from '@/lib/errors';
import { fileUrl, uploadToStorage } from '@/lib/upload';
import { useFormat } from '@/lib/use-format';
import { DocumentDialog } from './document-dialog';
import { ExpiryBadge } from './expiry-badge';

type Doc = Output<'vault', 'get'>;

export function DocumentDetail({ documentId }: { documentId: string }) {
  return (
    <ModuleGate action="vault.read">
      <FeatureGate feature="vault">
        <DocumentDetailInner documentId={documentId} />
      </FeatureGate>
    </ModuleGate>
  );
}

function DocumentDetailInner({ documentId }: { documentId: string }) {
  const t = useTranslations('vault');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const tv = useTranslations('visibility');
  const fmt = useFormat();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const { householdId, can, memberById } = useHousehold();
  const canWrite = can('vault.write');
  const detail = apiQuery(api, 'vault', 'get', { params: { householdId, documentId } });
  const query = useQuery({
    ...detail,
    // Poll while text recognition runs in the background.
    refetchInterval: (q) => (q.state.data?.ocrStatus === 'pending' ? 3000 : false),
  });
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const remove = useMutation({
    mutationFn: () => api.vault.remove({ params: { householdId, documentId } }),
    onSuccess: async () => {
      toast.success(t('deleted'));
      router.push('/vault');
      await queryClient.invalidateQueries({ queryKey: ['vault'] });
    },
    onError: toastError,
  });

  if (query.isPending) return <LoadingState rows={5} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState
          title={t('notFound')}
          action={
            <Button asChild variant="secondary">
              <Link href="/vault">{t('back')}</Link>
            </Button>
          }
        />
      );
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const doc = query.data;
  const holder = memberById(doc.holderMemberId);

  return (
    <div>
      <Link
        href="/vault"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('back')}
      </Link>
      <PageHeader
        title={doc.title}
        description={`${t(`types.${doc.type}`)} · ${holder?.displayName ?? t('household')}`}
        actions={
          canWrite ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label={tu('actions')}>
                  <MoreVertical aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil aria-hidden />
                  {tc('edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                  <Trash2 aria-hidden />
                  {tc('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('details')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3">
              <ExpiryBadge doc={doc} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{t('holder')}</dt>
              <dd>{holder?.displayName ?? t('household')}</dd>
              {doc.issuer ? (
                <>
                  <dt className="text-muted">{t('issuer')}</dt>
                  <dd>{doc.issuer}</dd>
                </>
              ) : null}
              {doc.documentNumber ? (
                <>
                  <dt className="text-muted">{t('documentNumber')}</dt>
                  <dd className="font-mono break-all">{doc.documentNumber}</dd>
                </>
              ) : null}
              {doc.issuedOn ? (
                <>
                  <dt className="text-muted">{t('issuedOn')}</dt>
                  <dd>{fmt.date(noon(doc.issuedOn))}</dd>
                </>
              ) : null}
              {doc.expiresOn ? (
                <>
                  <dt className="text-muted">{t('expiresOn')}</dt>
                  <dd>{fmt.date(noon(doc.expiresOn))}</dd>
                </>
              ) : null}
              {doc.reminderLeadDays.length > 0 ? (
                <>
                  <dt className="text-muted">{t('reminders')}</dt>
                  <dd>{doc.reminderLeadDays.join(', ')}</dd>
                </>
              ) : null}
              <dt className="text-muted">{t('visibility')}</dt>
              <dd>{tv(doc.visibility)}</dd>
            </dl>
            {doc.tags.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-1" aria-label={t('tags')}>
                {doc.tags.map((tag) => (
                  <li key={tag}>
                    <Badge variant="secondary">{tag}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            {doc.notes ? <p className="mt-3 text-sm whitespace-pre-line">{doc.notes}</p> : null}
          </CardContent>
        </Card>
        <div className="grid content-start gap-4">
          <FilesCard doc={doc} canWrite={canWrite} />
          <OcrCard doc={doc} canWrite={canWrite} />
        </div>
      </div>
      <DocumentDialog open={editing} onOpenChange={setEditing} doc={doc} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function useUpdateDoc(doc: VaultDocument) {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.vault.update>[0]['body']) =>
      api.vault.update({ params: { householdId, documentId: doc.id }, body }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(
        apiQuery(api, 'vault', 'get', { params: { householdId, documentId: doc.id } }).queryKey,
        saved,
      );
      await queryClient.invalidateQueries({ queryKey: ['vault'] });
    },
    onError: toastError,
  });
}

function FilesCard({ doc, canWrite }: { doc: Doc; canWrite: boolean }) {
  const t = useTranslations('vault');
  const { householdId } = useHousehold();
  const toastError = useToastError();
  const queryClient = useQueryClient();
  const update = useUpdateDoc(doc);
  const [picking, setPicking] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  // The vault only returns file ids; names come from storage (root folder) when available.
  const [names, setNames] = React.useState<Record<string, string>>({});
  const root = useQuery(apiQuery(api, 'storage', 'browse', { params: { householdId }, query: {} }));
  const nameOf = (id: string, i: number) =>
    names[id] ?? root.data?.files.find((f) => f.id === id)?.name ?? `${t('files')} ${i + 1}`;

  const attach = async (ids: string[]) => {
    const next = [...new Set([...doc.fileIds, ...ids])].slice(0, 20);
    await update.mutateAsync({ fileIds: next });
    toast.success(t('attached'));
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const stored = await uploadToStorage(householdId, file, {
        visibility: doc.visibility === 'household' ? 'household' : 'private',
      });
      setNames((n) => ({ ...n, [stored.id]: stored.name }));
      // OCR reads the file, so attach it once the scan finished.
      const ready = await waitUntilReady(householdId, [stored.id]);
      await attach(ready.length ? ready : [stored.id]);
      await queryClient.invalidateQueries({ queryKey: ['storage'] });
    } catch (err) {
      if (!update.isError) toastError(err);
    } finally {
      setUploading(false);
    }
  };

  const open = async (id: string) => {
    // Open the tab synchronously so pop-up blockers allow it, then point it at the signed URL.
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const url = await fileUrl(householdId, id);
      if (win) win.location.replace(url);
      else window.location.assign(url);
    } catch (err) {
      win?.close();
      toastError(err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('files')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {doc.fileIds.length === 0 ? (
          <p className="text-sm text-muted">{t('noFiles')}</p>
        ) : (
          <ul className="grid gap-1">
            {doc.fileIds.map((id, i) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
              >
                <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">{nameOf(id, i)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${t('openFile')}: ${nameOf(id, i)}`}
                  onClick={() => void open(id)}
                >
                  <ExternalLink aria-hidden />
                </Button>
                {canWrite ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t('detach')}: ${nameOf(id, i)}`}
                    disabled={update.isPending}
                    onClick={() => update.mutate({ fileIds: doc.fileIds.filter((f) => f !== id) })}
                  >
                    <X aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                void onUpload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button
              size="sm"
              onClick={() => input.current?.click()}
              loading={uploading}
              disabled={uploading || doc.fileIds.length >= 20}
            >
              <Upload aria-hidden />
              {uploading ? t('attachUploading') : t('attach')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPicking(true)}
              disabled={doc.fileIds.length >= 20}
            >
              <FolderOpen aria-hidden />
              {t('fromFiles')}
            </Button>
          </div>
        ) : null}
      </CardContent>
      <FilePickerDialog
        open={picking}
        onOpenChange={setPicking}
        title={t('attach')}
        description={t('description')}
        emptyLabel={t('noFiles')}
        confirmLabel={() => t('attach')}
        exclude={doc.fileIds}
        loading={update.isPending}
        onConfirm={(files: StoredFile[]) => {
          setNames((n) => ({ ...n, ...Object.fromEntries(files.map((f) => [f.id, f.name])) }));
          void attach(files.map((f) => f.id)).then(() => setPicking(false));
        }}
      />
    </Card>
  );
}

function OcrCard({ doc, canWrite }: { doc: Doc; canWrite: boolean }) {
  const t = useTranslations('vault.ocr');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const { enabled } = useFeature('ocr');
  const update = useUpdateDoc(doc);
  const [accepted, setAccepted] = React.useState<string[]>([]);

  const run = useMutation({
    mutationFn: () => api.vault.runOcr({ params: { householdId, documentId: doc.id } }),
    onSuccess: async (saved) => {
      toast.success(t('started'));
      queryClient.setQueryData(
        apiQuery(api, 'vault', 'get', { params: { householdId, documentId: doc.id } }).queryKey,
        saved,
      );
      await queryClient.invalidateQueries({ queryKey: ['vault'] });
    },
    onError: toastError,
  });

  if (enabled === false) {
    return <UpsellState feature="ocr" compact />;
  }

  const s = doc.suggestions;
  const rows: { field: 'expiresAt' | 'issuedAt' | 'documentNumber'; value: string; pct: number }[] =
    s
      ? (['expiresAt', 'issuedAt', 'documentNumber'] as const).flatMap((field) =>
          s[field].map((x) => ({ field, value: x.value, pct: Math.round(x.confidence * 100) })),
        )
      : [];
  const current = {
    expiresAt: doc.expiresOn,
    issuedAt: doc.issuedOn,
    documentNumber: doc.documentNumber,
  };
  const display = (field: string, value: string) =>
    field === 'documentNumber' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : fmt.date(noon(value));

  const accept = (field: 'expiresAt' | 'issuedAt' | 'documentNumber', value: string) => {
    const body =
      field === 'expiresAt'
        ? { expiresOn: value }
        : field === 'issuedAt'
          ? { issuedOn: value }
          : { documentNumber: value };
    update.mutate(body, {
      onSuccess: () => {
        setAccepted((a) => [...a, `${field}:${value}`]);
        toast.success(t('accepted'));
      },
    });
  };

  const statusVariant =
    doc.ocrStatus === 'done'
      ? 'success'
      : doc.ocrStatus === 'failed'
        ? 'danger'
        : doc.ocrStatus === 'pending'
          ? 'warning'
          : 'secondary';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanText className="size-4" aria-hidden />
          {t('title')}
        </CardTitle>
        <CardDescription>
          <Badge variant={statusVariant} aria-live="polite">
            {t(`status.${doc.ocrStatus}`)}
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {canWrite && doc.ocrStatus !== 'disabled' ? (
          <div>
            <Button
              size="sm"
              variant="secondary"
              loading={run.isPending || doc.ocrStatus === 'pending'}
              disabled={doc.fileIds.length === 0 || doc.ocrStatus === 'pending'}
              onClick={() => run.mutate()}
            >
              <ScanText aria-hidden />
              {doc.ocrStatus === 'done' || doc.ocrStatus === 'failed' ? t('rerun') : t('run')}
            </Button>
            {doc.fileIds.length === 0 ? (
              <p className="mt-1 text-xs text-muted">{t('needsFile')}</p>
            ) : null}
          </div>
        ) : null}
        {doc.ocrStatus === 'done' ? (
          <div>
            <h3 className="text-sm font-semibold">{t('suggestions')}</h3>
            <p className="mb-2 text-xs text-muted">{t('suggestionsHint')}</p>
            {s?.holderName ? (
              <p className="mb-2 text-sm">{t('holderName', { name: s.holderName })}</p>
            ) : null}
            {rows.length === 0 ? (
              <p className="text-sm text-muted">{t('noSuggestions')}</p>
            ) : (
              <ul className="grid gap-2">
                {rows.map((r) => {
                  const isCurrent =
                    current[r.field] === r.value || accepted.includes(`${r.field}:${r.value}`);
                  return (
                    <li
                      key={`${r.field}:${r.value}`}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted">{t(`fields.${r.field}`)}</p>
                        <p className="text-sm font-medium break-all">{display(r.field, r.value)}</p>
                      </div>
                      <span className="text-xs text-muted">{t('confidence', { pct: r.pct })}</span>
                      {canWrite ? (
                        <Button
                          size="sm"
                          variant={isCurrent ? 'ghost' : 'secondary'}
                          disabled={isCurrent || update.isPending}
                          onClick={() => accept(r.field, r.value)}
                        >
                          {isCurrent ? t('accepted') : t('accept')}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
