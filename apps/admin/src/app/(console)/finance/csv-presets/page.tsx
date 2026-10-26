'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { columnHelper, DataTable } from '@/components/data-table';
import { useCan } from '@/components/staff-context';
import { MissingRoleState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

type Preset = Awaited<ReturnType<typeof api.csvPresets>>[number];
const EMPTY: Preset[] = [];
const h = columnHelper<Preset>();

const DELIMITERS: Record<string, string> = {
  ',': 'Comma',
  ';': 'Semicolon',
  '\t': 'Tab',
  '|': 'Pipe',
};

function delimiterLabel(d: string): string {
  return DELIMITERS[d] ?? `"${d}"`;
}

const columns = h.columns([
  h.accessor('name', {
    header: 'Bank / format',
    cell: (c) => <span className="font-medium">{c.getValue()}</span>,
  }),
  h.accessor('id', {
    header: 'Preset ID',
    cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
  }),
  h.accessor('delimiter', {
    header: 'Delimiter',
    cell: (c) => (
      <span className="flex items-center gap-1.5">
        <code className="rounded-sm bg-surface-muted px-1 font-mono text-xs">
          {c.getValue() === '\t' ? '\\t' : c.getValue()}
        </code>
        <span className="text-xs text-muted">{delimiterLabel(c.getValue())}</span>
      </span>
    ),
  }),
  h.accessor('detect', {
    header: 'Detected by header columns',
    cell: (c) => (
      <div className="flex flex-wrap gap-1">
        {c.getValue().map((col) => (
          <Badge key={col} variant="outline" className="font-mono">
            {col}
          </Badge>
        ))}
      </div>
    ),
  }),
]);

export default function CsvPresetsPage() {
  const canView = useCan('finance.view');
  const presets = useQuery({
    queryKey: ['csvPresets'],
    queryFn: () => api.csvPresets(),
    enabled: canView,
  });

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/finance">
            <ArrowLeftIcon />
            Finance defaults
          </Link>
        </Button>
      </div>
      <PageHeader
        title="CSV presets"
        description="Bank CSV import formats recognised by the finance import. Defined in code (@fp/domain); read-only."
      />
      <Card>
        <CardHeader>
          <CardTitle>Presets</CardTitle>
          {presets.data ? <span className="text-xs text-muted">{presets.data.length}</span> : null}
        </CardHeader>
        {canView ? (
          <DataTable
            columns={columns}
            data={presets.data ?? EMPTY}
            isPending={presets.isPending}
            error={presets.error}
            onRetry={() => void presets.refetch()}
            emptyText="No CSV presets defined."
            getRowId={(p) => p.id}
          />
        ) : (
          <MissingRoleState role="ops" />
        )}
      </Card>
    </>
  );
}
