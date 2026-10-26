import { importCamt } from './camt-import.js';
import { type CsvImportOptions, importCsv } from './csv-import.js';
import { importMt940 } from './mt940-import.js';
import type { ImportResult } from './types.js';

export * from './advanced-reports.js';
export * from './budgets.js';
export * from './camt-import.js';
export * from './contracts.js';
export * from './csv-import.js';
export * from './csv-presets.js';
export * from './dedupe.js';
export * from './goals.js';
export * from './mt940-import.js';
export * from './reports.js';
export * from './rules.js';
export * from './shared-expenses.js';
export * from './types.js';

/** Detects the statement format (CAMT XML, MT940 or CSV) and imports it. */
export function importStatement(content: string, options: CsvImportOptions = {}): ImportResult {
  const head = content.trimStart().slice(0, 500);
  if (head.startsWith('<')) return importCamt(content);
  if (/^:20:|\n:20:|^\{1:/m.test(head) || /:61:\d{6}/.test(content)) return importMt940(content);
  return importCsv(content, options);
}
