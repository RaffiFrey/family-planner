'use client';

import { ApiError } from '@fp/api-client';
import type { AssistantProposal } from '@fp/contracts';
import { isCurrencyCode } from '@fp/domain/money';
import { useMutation } from '@tanstack/react-query';
import {
  ChefHat,
  Lightbulb,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Progress } from '@/components/ui/misc';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { uploadToStorage } from '@/lib/upload';
import { useFormat } from '@/lib/use-format';
import { AssistantErrorAlert } from './assistant-errors';
import { ProposalCard } from './proposal-card';

function useMoney() {
  const fmt = useFormat();
  return React.useCallback(
    (amountMinor: number, currency: string) =>
      isCurrencyCode(currency)
        ? fmt.money(amountMinor, currency)
        : `${(amountMinor / 100).toFixed(2)} ${currency}`,
    [fmt],
  );
}

function Thinking({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
      <Sparkles className="size-4 animate-pulse text-primary" aria-hidden />
      {label}
    </p>
  );
}

// ---------------------------------------------------------------- capture

export function CapturePanel() {
  const t = useTranslations('assistant.capture');
  const { householdId } = useHousehold();
  const [text, setText] = React.useState('');
  const [proposals, setProposals] = React.useState<AssistantProposal[]>([]);

  const capture = useMutation({
    mutationFn: (input: string) =>
      api.assistant.capture({ params: { householdId }, body: { text: input } }),
    onSuccess: (p) => {
      setProposals((prev) => [p, ...prev]);
      setText('');
    },
  });

  const submit = () => {
    const value = text.trim();
    if (value.length < 2 || capture.isPending) return;
    capture.mutate(value);
  };

  const update = (next: AssistantProposal) =>
    setProposals((prev) => prev.map((p) => (p.id === next.id ? next : p)));

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="pt-4">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label={t('label')} hint={t('hint')}>
              {(p) => (
                <Textarea
                  {...p}
                  value={text}
                  maxLength={1000}
                  rows={3}
                  placeholder={t('placeholder')}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
              )}
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {capture.isPending ? <Thinking label={t('thinking')} /> : <span />}
              <Button type="submit" loading={capture.isPending} disabled={text.trim().length < 2}>
                <Sparkles aria-hidden />
                {t('submit')}
              </Button>
            </div>
            {capture.isError ? <AssistantErrorAlert error={capture.error} /> : null}
          </form>
        </CardContent>
      </Card>
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} onChange={update} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- receipt

type ReceiptResult = Awaited<ReturnType<typeof api.assistant.receipt>>;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ReceiptPanel() {
  const t = useTranslations('assistant.receipt');
  const money = useMoney();
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [phase, setPhase] = React.useState<'idle' | 'uploading' | 'scanning' | 'extracting'>(
    'idle',
  );
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<ReceiptResult | null>(null);

  const run = useMutation({
    mutationFn: async (file: File) => {
      setResult(null);
      setPhase('uploading');
      setProgress(0);
      const stored = await uploadToStorage(householdId, file, {
        visibility: 'private',
        onProgress: setProgress,
      });
      setPhase(stored.status === 'ready' ? 'extracting' : 'scanning');
      // The virus scan may still be running: retry while the API says the file is not ready.
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await api.assistant.receipt({
            params: { householdId },
            body: { fileId: stored.id },
          });
          return res;
        } catch (err) {
          const notReady =
            err instanceof ApiError && err.problem.code === 'file_not_ready' && attempt < 20;
          if (!notReady) throw err;
          setPhase('scanning');
          await wait(1500);
          setPhase('extracting');
        }
      }
    },
    onSuccess: (res) => setResult(res),
    onSettled: () => setPhase('idle'),
  });

  const busy = phase !== 'idle';

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            data-testid="receipt-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) run.mutate(file);
            }}
          />
          <div>
            <Button onClick={() => inputRef.current?.click()} loading={busy} disabled={busy}>
              <Upload aria-hidden />
              {result ? t('another') : t('choose')}
            </Button>
          </div>
          {phase === 'uploading' ? (
            <div className="grid gap-1" role="status">
              <span className="text-sm text-muted">{t('uploading')}</span>
              <Progress value={progress} aria-label={t('uploading')} />
            </div>
          ) : phase === 'scanning' ? (
            <Thinking label={t('scanning')} />
          ) : phase === 'extracting' ? (
            <Thinking label={t('extracting')} />
          ) : null}
          {run.isError ? <AssistantErrorAlert error={run.error} /> : null}
        </CardContent>
      </Card>

      {result ? (
        <>
          <Card>
            <CardContent className="grid gap-3 pt-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">{t('merchant')}</dt>
                <dd>{result.receipt.merchant ?? '–'}</dd>
                <dt className="text-muted">{t('date')}</dt>
                <dd>{fmt.date(result.receipt.date)}</dd>
                <dt className="text-muted">{t('total')}</dt>
                <dd className="font-semibold tabular-nums">
                  {money(result.receipt.totalMinor, result.receipt.currency)}
                </dd>
              </dl>
              {result.receipt.lineItems.length > 0 ? (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    {t('items')} ({result.receipt.lineItems.length})
                  </summary>
                  <ul className="mt-2 grid gap-1 text-sm">
                    {result.receipt.lineItems.map((li, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {li.quantity && li.quantity !== 1 ? `${li.quantity} × ` : ''}
                          {li.description}
                        </span>
                        <span className="tabular-nums">
                          {money(li.amountMinor, result.receipt.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {result.warnings.length > 0 ? (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                  <p className="font-medium">{t('warnings')}</p>
                  <ul className="list-disc pl-5">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <ProposalCard
            proposal={result.proposal}
            onChange={(p) => setResult((r) => (r ? { ...r, proposal: p } : r))}
          />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- insights

const MONTHS = [1, 3, 6, 12] as const;

export function InsightsPanel() {
  const t = useTranslations('assistant.insights');
  const money = useMoney();
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const [months, setMonths] = React.useState<number>(3);
  const run = useMutation({
    mutationFn: (m: number) =>
      api.assistant.insights({ params: { householdId }, body: { months: m } }),
  });
  const data = run.data;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run.mutate(months);
            }}
          >
            <Field label={t('months')} className="w-56">
              {(p) => (
                <NativeSelect
                  {...p}
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {t('monthsOption', { count: m })}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Button type="submit" loading={run.isPending}>
              <Sparkles aria-hidden />
              {t('run')}
            </Button>
          </form>
          {run.isError ? <AssistantErrorAlert error={run.error} className="mt-3" /> : null}
        </CardContent>
      </Card>

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t('income')} value={money(data.totalIncomeMinor, data.currency)} />
            <Stat label={t('expenses')} value={money(data.totalExpenseMinor, data.currency)} />
            <Stat label={t('avg')} value={money(data.avgMonthlyExpenseMinor, data.currency)} />
            <Stat
              label={t('savingsRate')}
              value={
                data.savingsRatePercent === null
                  ? '–'
                  : `${fmt.number(Math.round(data.savingsRatePercent))} %`
              }
            />
          </div>
          {data.text ? (
            <Card>
              <CardContent className="pt-4 text-sm leading-relaxed whitespace-pre-line">
                {data.text}
              </CardContent>
            </Card>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.topCategories.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('topCategories')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-3">
                    {data.topCategories.map((c) => (
                      <li key={c.name} className="grid gap-1">
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="truncate">{c.name}</span>
                          <span className="tabular-nums">
                            {money(c.expenseMinor, data.currency)} ·{' '}
                            {fmt.number(Math.round(c.percent))} %
                          </span>
                        </div>
                        <Progress value={c.percent} aria-label={c.name} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
            <div className="grid content-start gap-4">
              {data.highlights.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('highlights')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid gap-2 text-sm">
                      {data.highlights.map((h, i) => (
                        <li key={i} className="flex items-start gap-2">
                          {h.kind === 'increase' || h.kind === 'net_negative' ? (
                            <TrendingUp
                              className="mt-0.5 size-4 shrink-0 text-danger"
                              aria-hidden
                            />
                          ) : (
                            <TrendingDown
                              className="mt-0.5 size-4 shrink-0 text-success"
                              aria-hidden
                            />
                          )}
                          {t(`highlight.${h.kind}`, {
                            category: h.categoryName ?? '',
                            percent: fmt.number(Math.round(Math.abs(h.percent ?? 0))),
                          })}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
              {data.tips.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('tips')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid gap-2 text-sm">
                      {data.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- meals

export function MealsPanel() {
  const t = useTranslations('assistant.meals');
  const { householdId } = useHousehold();
  const [ingredients, setIngredients] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState('');
  const [servings, setServings] = React.useState(4);
  const [preferences, setPreferences] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const run = useMutation({
    mutationFn: (list: string[]) =>
      api.assistant.meals({
        params: { householdId },
        body: {
          ingredients: list,
          servings,
          ...(preferences.trim() ? { preferences: preferences.trim() } : {}),
        },
      }),
  });

  /** Moves the typed text (comma separated) into the ingredient chips; returns the new list. */
  const addDraft = (): string[] => {
    const parts = draft
      .split(',')
      .map((s) => s.trim().slice(0, 80))
      .filter(Boolean);
    const next = [...new Set([...ingredients, ...parts])].slice(0, 50);
    if (parts.length > 0) {
      setIngredients(next);
      setDraft('');
      setError(null);
    }
    return next;
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const all = addDraft();
              if (all.length === 0) {
                setError(t('needIngredient'));
                return;
              }
              run.mutate(all);
            }}
          >
            <Field label={t('ingredients')} error={error ?? undefined}>
              {(p) => (
                <div className="flex gap-2">
                  <Input
                    {...p}
                    value={draft}
                    placeholder={t('ingredientsPlaceholder')}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDraft();
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => addDraft()}
                    aria-label={t('addIngredient')}
                  >
                    <Plus aria-hidden />
                  </Button>
                </div>
              )}
            </Field>
            {ingredients.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label={t('ingredients')}>
                {ingredients.map((name) => (
                  <li key={name}>
                    <Badge variant="secondary" className="gap-1 py-1 pr-1 text-sm">
                      {name}
                      <button
                        type="button"
                        className="rounded-full p-0.5 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={t('removeIngredient', { name })}
                        onClick={() => setIngredients((prev) => prev.filter((x) => x !== name))}
                      >
                        <X aria-hidden />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Field label={t('servings')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    max={20}
                    value={servings}
                    onChange={(e) =>
                      setServings(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
                    }
                  />
                )}
              </Field>
              <Field label={t('preferences')}>
                {(p) => (
                  <Input
                    {...p}
                    value={preferences}
                    maxLength={200}
                    placeholder={t('preferencesPlaceholder')}
                    onChange={(e) => setPreferences(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <div>
              <Button type="submit" loading={run.isPending}>
                <ChefHat aria-hidden />
                {t('run')}
              </Button>
            </div>
            {run.isError ? <AssistantErrorAlert error={run.error} /> : null}
          </form>
        </CardContent>
      </Card>

      {run.data ? (
        run.data.ideas.length === 0 ? (
          <p className="text-sm text-muted">{t('empty')}</p>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-3">
            {run.data.ideas.map((idea, i) => (
              <li key={i}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>{idea.title}</CardTitle>
                    <CardDescription>
                      {idea.prepMinutes ? `${t('prep', { minutes: idea.prepMinutes })} · ` : ''}
                      {idea.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <div>
                      {idea.missing.length > 0 ? (
                        <p>
                          <span className="font-medium">{t('missing')}:</span>{' '}
                          {idea.missing.join(', ')}
                        </p>
                      ) : (
                        <Badge variant="success">{t('nothingMissing')}</Badge>
                      )}
                    </div>
                    <details>
                      <summary className="cursor-pointer font-medium">
                        {t('ingredientsTitle')}
                      </summary>
                      <ul className="mt-1 list-disc pl-5">
                        {idea.ingredients.map((ing, j) => (
                          <li key={j} className={ing.inPantry ? undefined : 'text-muted'}>
                            {ing.quantity ? `${ing.quantity} ` : ''}
                            {ing.name}
                          </li>
                        ))}
                      </ul>
                    </details>
                    <details>
                      <summary className="cursor-pointer font-medium">{t('steps')}</summary>
                      <ol className="mt-1 list-decimal pl-5">
                        {idea.steps.map((s, j) => (
                          <li key={j}>{s}</li>
                        ))}
                      </ol>
                    </details>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
