'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheetIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import type { GlobalCategory, GlobalRule } from '@fp/contracts';
import { columnHelper, DataTable } from '@/components/data-table';
import { ReasonDialog, ReasonField, reasonSchema } from '@/components/reason-dialog';
import { useCan } from '@/components/staff-context';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/table';
import { api, errorMessage, withReason } from '@/lib/api';
import { categoryName } from '@/lib/format';

type Category = z.infer<typeof GlobalCategory>;
type Rule = z.infer<typeof GlobalRule>;
type Condition = Rule['conditions'][number];
const EMPTY_RULES: Rule[] = [];
const h = columnHelper<Rule>();

const FIELDS: { value: Condition['field']; label: string }[] = [
  { value: 'counterparty', label: 'Counterparty' },
  { value: 'purpose', label: 'Purpose' },
  { value: 'iban', label: 'IBAN' },
  { value: 'bookingText', label: 'Booking text' },
  { value: 'any', label: 'Any field' },
];
const OPS: { value: Condition['op']; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'regex', label: 'matches regex' },
];
const KIND_VARIANT = { income: 'success', expense: 'default', transfer: 'outline' } as const;

interface TreeNode extends Category {
  children: TreeNode[];
}

function buildTree(categories: readonly Category[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(categories.map((c) => [c.id, { ...c, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'de'));
    nodes.forEach((n) => {
      sort(n.children);
    });
  };
  sort(roots);
  return roots;
}

function CategoryTree({ nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number }) {
  return (
    <ul className={depth === 0 ? 'grid gap-0.5' : 'ml-4 grid gap-0.5 border-l border-border pl-2'}>
      {nodes.map((n) => {
        const label = categoryName(n);
        return (
          <li key={n.id}>
            <div className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-surface-muted">
              <span className={depth === 0 ? 'font-medium' : undefined}>{label}</span>
              {n.key ? (
                <span className="font-mono text-[11px] text-muted" title="i18n key">
                  {n.key}
                </span>
              ) : (
                <span className="text-[11px] text-muted italic">no key</span>
              )}
              {depth === 0 ? (
                <Badge variant={KIND_VARIANT[n.kind]} className="ml-auto">
                  {n.kind}
                </Badge>
              ) : null}
            </div>
            {n.children.length ? <CategoryTree nodes={n.children} depth={depth + 1} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function categoryPath(id: string, byId: Map<string, Category>): string {
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 10) {
    parts.unshift(categoryName(cur));
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.length ? parts.join(' / ') : id;
}

const ruleSchema = z.object({
  categoryId: z.uuid('Pick a category'),
  priority: z.coerce.number<string | number>().int('Whole number').min(-1000).max(1000),
  direction: z.enum(['any', 'in', 'out']),
  conditions: z
    .array(
      z
        .object({
          field: z.enum(['counterparty', 'purpose', 'iban', 'bookingText', 'any']),
          op: z.enum(['contains', 'equals', 'startsWith', 'regex']),
          value: z.string().trim().min(1, 'Required'),
        })
        .refine(
          (c) => {
            if (c.op !== 'regex') return true;
            try {
              new RegExp(c.value);
              return true;
            } catch {
              return false;
            }
          },
          { path: ['value'], message: 'Invalid regular expression' },
        ),
    )
    .min(1, 'At least one condition'),
  reason: reasonSchema,
});
type RuleValues = z.input<typeof ruleSchema>;

function RuleDialog({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: Category[];
}) {
  const qc = useQueryClient();
  const form = useForm<RuleValues, unknown, z.output<typeof ruleSchema>>({
    resolver: zodResolver(ruleSchema),
  });
  const { reset } = form;
  const conditions = useFieldArray({ control: form.control, name: 'conditions' });
  const byId = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const options = React.useMemo(
    () =>
      categories
        .map((c) => ({ id: c.id, label: categoryPath(c.id, byId) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [categories, byId],
  );

  React.useEffect(() => {
    if (open)
      reset({
        categoryId: '',
        priority: 100,
        direction: 'any',
        conditions: [{ field: 'counterparty', op: 'contains', value: '' }],
        reason: '',
      });
  }, [open, reset]);

  const submit = form.handleSubmit(async (v) => {
    try {
      await api.createGlobalRule(
        {
          body: {
            categoryId: v.categoryId,
            priority: v.priority,
            direction: v.direction === 'any' ? null : v.direction,
            conditions: v.conditions,
          },
        },
        withReason(v.reason),
      );
      await qc.invalidateQueries({ queryKey: ['globalRules'] });
      toast.success('Rule created');
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>New global rule</DialogTitle>
            <DialogDescription>
              Applies to every household&apos;s imported transactions unless overridden by household
              rules. All conditions must match.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
            <Field label="Category" htmlFor="rule-cat" error={errors.categoryId?.message}>
              <NativeSelect id="rule-cat" {...form.register('categoryId')}>
                <option value="">Select category...</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Direction" htmlFor="rule-dir">
              <NativeSelect id="rule-dir" {...form.register('direction')}>
                <option value="any">Both</option>
                <option value="in">Incoming</option>
                <option value="out">Outgoing</option>
              </NativeSelect>
            </Field>
            <Field
              label="Priority"
              htmlFor="rule-prio"
              error={errors.priority?.message}
              hint="Higher wins"
            >
              <Input id="rule-prio" type="number" step={1} {...form.register('priority')} />
            </Field>
          </div>

          <fieldset className="grid gap-2">
            <Label asChild>
              <legend>Conditions</legend>
            </Label>
            {conditions.fields.map((f, i) => {
              const err = errors.conditions?.[i];
              return (
                <div key={f.id} className="grid gap-1">
                  <div className="grid grid-cols-[9rem_9rem_1fr_auto] gap-2">
                    <NativeSelect
                      aria-label={`Condition ${i + 1} field`}
                      {...form.register(`conditions.${i}.field`)}
                    >
                      {FIELDS.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </NativeSelect>
                    <NativeSelect
                      aria-label={`Condition ${i + 1} operator`}
                      {...form.register(`conditions.${i}.op`)}
                    >
                      {OPS.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </NativeSelect>
                    <Input
                      aria-label={`Condition ${i + 1} value`}
                      placeholder="e.g. REWE"
                      aria-invalid={err?.value ? true : undefined}
                      {...form.register(`conditions.${i}.value`)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove condition ${i + 1}`}
                      disabled={conditions.fields.length <= 1}
                      onClick={() => {
                        conditions.remove(i);
                      }}
                    >
                      <XIcon />
                    </Button>
                  </div>
                  {err?.value?.message ? (
                    <p className="text-xs text-danger">{err.value.message}</p>
                  ) : null}
                </div>
              );
            })}
            {(errors.conditions?.root?.message ?? errors.conditions?.message) ? (
              <p className="text-xs text-danger">
                {errors.conditions.root?.message ?? errors.conditions.message}
              </p>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start"
              onClick={() => {
                conditions.append({ field: 'purpose', op: 'contains', value: '' });
              }}
            >
              <PlusIcon />
              Add condition
            </Button>
          </fieldset>

          <ReasonField register={form.register} errors={errors} id="rule-reason" />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving...' : 'Create rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function describe(c: Condition): string {
  const field = FIELDS.find((f) => f.value === c.field)?.label ?? c.field;
  const op = OPS.find((o) => o.value === c.op)?.label ?? c.op;
  return `${field} ${op} "${c.value}"`;
}

export default function FinanceDefaultsPage() {
  const qc = useQueryClient();
  const canWrite = useCan('rules.write');
  const categories = useQuery({
    queryKey: ['globalCategories'],
    queryFn: () => api.globalCategories(),
  });
  const rules = useQuery({ queryKey: ['globalRules'], queryFn: () => api.globalRules() });
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Rule | null>(null);

  const tree = React.useMemo(() => buildTree(categories.data ?? []), [categories.data]);
  const byId = React.useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );
  const sortedRules = React.useMemo(
    () => (rules.data ? [...rules.data].sort((a, b) => b.priority - a.priority) : EMPTY_RULES),
    [rules.data],
  );

  const columns = React.useMemo(
    () =>
      h.columns([
        h.accessor('priority', {
          header: 'Prio',
          cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
        }),
        h.accessor('conditions', {
          header: 'When',
          cell: (c) => (
            <ul className="grid gap-0.5 text-xs">
              {c.getValue().map((cond, i) => (
                <li key={i} className="font-mono">
                  {i > 0 ? <span className="text-muted">AND </span> : null}
                  {describe(cond)}
                </li>
              ))}
            </ul>
          ),
        }),
        h.accessor('direction', {
          header: 'Direction',
          cell: (c) => (
            <Badge variant="outline">
              {c.getValue() === 'in' ? 'Incoming' : c.getValue() === 'out' ? 'Outgoing' : 'Both'}
            </Badge>
          ),
        }),
        h.accessor('categoryId', {
          header: 'Category',
          cell: (c) => (
            <span className="font-medium">
              {byId.size ? categoryPath(c.getValue(), byId) : c.getValue()}
            </span>
          ),
        }),
        h.display({
          id: 'actions',
          header: () => <span className="sr-only">Actions</span>,
          cell: (c) => (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                disabled={!canWrite}
                aria-label="Delete rule"
                onClick={() => {
                  setDeleting(c.row.original);
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          ),
        }),
      ]),
    [byId, canWrite],
  );

  return (
    <>
      <PageHeader
        title="Finance defaults"
        description="Global category tree and categorisation rules shipped to every household."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/finance/csv-presets">
                <FileSpreadsheetIcon />
                CSV presets
              </Link>
            </Button>
            <Button
              disabled={!canWrite || !categories.data}
              title={canWrite ? undefined : 'Requires the ops role'}
              onClick={() => {
                setCreateOpen(true);
              }}
            >
              <PlusIcon />
              New rule
            </Button>
          </>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-[20rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            {categories.data ? (
              <span className="text-xs text-muted">{categories.data.length}</span>
            ) : null}
          </CardHeader>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {categories.isPending ? (
              <div className="grid gap-1.5 p-2">
                {Array.from({ length: 10 }, (_, i) => (
                  <Skeleton key={i} className="h-5" />
                ))}
              </div>
            ) : categories.isError ? (
              <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />
            ) : tree.length === 0 ? (
              <EmptyState title="No global categories" />
            ) : (
              <CategoryTree nodes={tree} />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rules</CardTitle>
            {rules.data ? <span className="text-xs text-muted">{rules.data.length}</span> : null}
          </CardHeader>
          <DataTable
            columns={columns}
            data={sortedRules}
            isPending={rules.isPending}
            error={rules.error}
            onRetry={() => void rules.refetch()}
            emptyText="No global rules."
            getRowId={(r) => r.id}
          />
        </Card>
      </div>

      <RuleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={categories.data ?? []}
      />
      <ReasonDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Delete global rule?"
        description={
          deleting
            ? `${deleting.conditions.map(describe).join(' AND ')} -> ${categoryPath(deleting.categoryId, byId)}`
            : undefined
        }
        confirmLabel="Delete rule"
        destructive
        successMessage="Rule deleted"
        onConfirm={async (reason) => {
          if (!deleting) return;
          await api.deleteGlobalRule({ params: { id: deleting.id } }, withReason(reason));
          await qc.invalidateQueries({ queryKey: ['globalRules'] });
        }}
      />
    </>
  );
}
