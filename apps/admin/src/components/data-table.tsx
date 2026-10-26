'use client';

import {
  type ColumnHelper,
  createColumnHelper,
  type RowData,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import * as React from 'react';
import { ErrorState } from '@/components/states';
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** Server-side paginated admin lists only need the core row model. */
export const tableFeats = tableFeatures({});
export type TableFeats = typeof tableFeats;

export function columnHelper<T extends RowData>(): ColumnHelper<TableFeats, T> {
  return createColumnHelper<TableFeats, T>();
}

export type Columns<T extends RowData> = ReturnType<ColumnHelper<TableFeats, T>['columns']>;

interface DataTableProps<T extends RowData> {
  columns: Columns<T>;
  /** Pass a stable reference (module-level empty array as fallback). */
  data: readonly T[];
  isPending?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyText?: string;
  getRowId?: (row: T) => string;
  skeletonRows?: number;
}

export function DataTable<T extends RowData>({
  columns,
  data,
  isPending,
  error,
  onRetry,
  emptyText = 'Nothing found.',
  getRowId,
  skeletonRows = 8,
}: DataTableProps<T>) {
  const table = useTable({
    features: tableFeats,
    columns,
    data,
    ...(getRowId ? { getRowId: (row: T) => getRowId(row) } : {}),
  });

  const colCount = columns.length;
  const rows = table.getRowModel().rows;

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="hover:bg-transparent">
            {group.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {isPending ? (
          Array.from({ length: skeletonRows }, (_, i) => (
            <TableRow key={`sk-${String(i)}`} className="hover:bg-transparent">
              {Array.from({ length: colCount }, (_c, j) => (
                <TableCell key={j}>
                  <Skeleton className="h-4 w-full max-w-40" />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : error ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={colCount}>
              <ErrorState error={error} onRetry={onRetry} />
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={colCount} className="py-10 text-center text-muted">
              {emptyText}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
