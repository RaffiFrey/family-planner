'use client';

import { apiQuery, type Output } from '@fp/api-client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileUp, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { EmptyState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import {
  accountById,
  useAccounts,
  useCategoryLabel,
  useCategoryOptions,
  useInvalidateFinance,
} from './hooks';

const MAX_CHARS = 5_000_000;

type Preview = Output<'finance', 'previewImport'>;
type Result = Output<'finance', 'importStatement'>;

interface Source {
  accountId: string;
  content: string;
  fileName: string;
  presetId: string;
}

export function ImportWizard() {
  const t = useTranslations('finance.import');
  const tf = useTranslations('finance');
  const tc = useTranslations('common');
  const { householdId, can } = useHousehold();
  const fmt = useFormat();
  const accounts = useAccounts();
  const presets = useQuery(apiQuery(api, 'finance', 'csvPresets'));
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();
  const label = useCategoryLabel();
  const { byId } = useCategoryOptions({ includeHidden: true });

  const [accountId, setAccountId] = React.useState('');
  const [presetId, setPresetId] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | undefined>();
  const [source, setSource] = React.useState<Source | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const effectiveAccountId = accountId || accounts.data?.[0]?.id || '';
  const account = accountById(accounts.data, source?.accountId ?? effectiveAccountId);
  const step = result ? 3 : preview ? 2 : 1;

  const previewMutation = useMutation({
    mutationFn: (s: Source) =>
      api.finance.previewImport({
        params: { householdId, accountId: s.accountId },
        body: { content: s.content, fileName: s.fileName, presetId: s.presetId || undefined },
      }),
    onSuccess: (data) => setPreview(data),
    onError: toastError,
  });

  const importMutation = useMutation({
    mutationFn: (s: Source) =>
      api.finance.importStatement({
        params: { householdId, accountId: s.accountId },
        body: { content: s.content, fileName: s.fileName, presetId: s.presetId || undefined },
      }),
    onSuccess: async (data) => {
      setResult(data);
      await invalidate();
    },
    onError: toastError,
  });

  if (!can('finance.write')) return <EmptyState icon={<Lock />} title={tf('readOnly')} />;

  const startPreview = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      setFileError(t('chooseFile'));
      return;
    }
    const content = await file.text();
    if (content.length > MAX_CHARS) {
      setFileError(t('fileTooLarge'));
      return;
    }
    setFileError(undefined);
    const s: Source = { accountId: effectiveAccountId, content, fileName: file.name, presetId };
    setSource(s);
    previewMutation.mutate(s);
  };

  const restart = () => {
    setPreview(null);
    setResult(null);
    setSource(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const newRows = preview?.rows.filter((r) => !r.duplicate).length ?? 0;
  const duplicates = preview ? preview.rows.length - newRows : 0;
  const steps = [t('steps.file'), t('steps.preview'), t('steps.done')];

  return (
    <div className="grid gap-4">
      <PageHeader title={t('title')} description={t('subtitle')} className="mb-0" />

      <ol
        className="flex flex-wrap gap-2 text-sm"
        aria-label={t('stepOf', { current: step, total: 3 })}
      >
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={step === i + 1 ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1',
              step === i + 1
                ? 'border-primary bg-primary/10 text-primary'
                : step > i + 1
                  ? 'border-border text-foreground'
                  : 'border-border text-muted',
            )}
          >
            <span className="font-semibold tabular-nums">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        accounts.data?.length === 0 ? (
          <EmptyState
            title={tf('transactions.noAccounts')}
            action={
              <Button asChild>
                <Link href="/finance">{tf('accounts.add')}</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="pt-4">
              <form
                onSubmit={(e) => void startPreview(e)}
                className="grid gap-4 sm:max-w-lg"
                noValidate
              >
                <Field label={t('account')}>
                  {(p) => (
                    <NativeSelect
                      {...p}
                      value={effectiveAccountId}
                      onChange={(e) => setAccountId(e.target.value)}
                    >
                      {(accounts.data ?? []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
                <Field label={t('file')} hint={t('fileHint')} error={fileError}>
                  {(p) => (
                    <Input
                      {...p}
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt,.xml,.sta,.mt940,.940,text/csv,application/xml,text/xml,text/plain"
                      className="h-auto py-2"
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        setFileError(undefined);
                      }}
                    />
                  )}
                </Field>
                <Field label={t('preset')}>
                  {(p) => (
                    <NativeSelect
                      {...p}
                      value={presetId}
                      onChange={(e) => setPresetId(e.target.value)}
                    >
                      <option value="">{t('presetAuto')}</option>
                      {(presets.data ?? []).map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
                <Button
                  type="submit"
                  className="w-fit"
                  loading={previewMutation.isPending}
                  disabled={!effectiveAccountId}
                >
                  <FileUp aria-hidden />
                  {t('preview')}
                </Button>
              </form>
            </CardContent>
          </Card>
        )
      ) : null}

      {step === 2 && preview && source ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{t('format', { format: preview.format })}</Badge>
            <span>{t('summary', { rows: preview.rows.length, duplicates })}</span>
            {account ? <span className="text-muted">· {account.name}</span> : null}
          </div>

          {preview.issues.length > 0 ? (
            <div
              role="status"
              className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
            >
              <p className="mb-1 flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4 text-warning" aria-hidden />
                {t('issues')}
              </p>
              <ul className="list-inside list-disc">
                {preview.issues.map((issue) => (
                  <li key={`${issue.line}-${issue.message}`}>
                    {t('line', { line: issue.line })}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.rows.length === 0 ? (
            <EmptyState title={t('noRows')} />
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{t('steps.preview')}</caption>
                <thead className="sticky top-0 bg-surface-muted text-left text-xs text-muted uppercase">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {tf('transactions.date')}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {tf('transactions.counterparty')}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t('suggested')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {tf('transactions.amount')}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t('status')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'border-t border-border align-top',
                        r.duplicate && 'text-muted',
                      )}
                    >
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {fmt.date(`${r.bookingDate}T12:00:00Z`)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="max-w-sm truncate font-medium">
                          {r.counterpartyName ?? '–'}
                        </div>
                        <div className="max-w-sm truncate text-xs text-muted">{r.purpose}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.suggestedCategoryId ? label(byId.get(r.suggestedCategoryId)) : '–'}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right whitespace-nowrap tabular-nums',
                          r.amountMinor >= 0 && !r.duplicate && 'text-success',
                        )}
                      >
                        {fmt.money(r.amountMinor, account?.currency)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.duplicate ? (
                            <Badge variant="warning">{t('duplicate')}</Badge>
                          ) : (
                            <Badge variant="success">{t('new')}</Badge>
                          )}
                          {r.status === 'pending' ? (
                            <Badge variant="secondary">{tf('transactions.pending')}</Badge>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={restart}>
              {tc('back')}
            </Button>
            <Button
              loading={importMutation.isPending}
              disabled={newRows === 0}
              onClick={() => importMutation.mutate(source)}
            >
              {t('importRows', { count: newRows })}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 && result ? (
        <Card>
          <CardContent className="grid gap-4 pt-4">
            <p className="flex items-center gap-2 font-medium" role="status">
              <CheckCircle2 className="size-5 text-success" aria-hidden />
              {t('done', { imported: result.imported, duplicates: result.duplicates })}
            </p>
            {result.issues.length > 0 ? (
              <ul className="list-inside list-disc text-sm text-muted">
                {result.issues.map((issue) => (
                  <li key={`${issue.line}-${issue.message}`}>
                    {t('line', { line: issue.line })}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={restart}>
                {t('another')}
              </Button>
              <Button asChild>
                <Link href={`/finance/transactions?accountId=${source?.accountId ?? ''}`}>
                  {t('toTransactions')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
