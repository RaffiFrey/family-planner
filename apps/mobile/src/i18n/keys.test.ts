import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { mobileDe } from './de';
import { mobileEn } from './en';

function leaves(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' ? leaves(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

const deKeys = new Set(leaves(mobileDe));

describe('mobile translations', () => {
  it('has the same keys in German and English', () => {
    expect(leaves(mobileEn).sort()).toEqual([...deKeys].sort());
  });

  it('defines every static m.* key used in the code (plurals via _one/_other)', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(join(__dirname, '..'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/t\(['`]m\.([A-Za-z0-9_.]+)['`]/g)) {
        if (match[1]) used.add(match[1]);
      }
    }
    const missing = [...used].filter((k) => !deKeys.has(k) && !deKeys.has(`${k}_one`));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(50);
  });

  it('covers dynamic key families', () => {
    const families: Record<string, readonly string[]> = {
      'tasks.groups': ['overdue', 'today', 'upcoming', 'someday'],
      recurrence: [
        'none',
        'daily',
        'weekdays',
        'weekly',
        'biweekly',
        'monthly',
        'yearly',
        'custom',
      ],
      'recurrence.units': ['day', 'week', 'month', 'year'],
      'files.status': ['pending_upload', 'scanning', 'ready', 'infected', 'failed'],
      'finance.periods': ['monthly', 'yearly'],
      'notifications.digestOptions': ['off', 'daily', 'weekly'],
      calendar: ['reminder10', 'reminder30', 'reminder60', 'reminder1440'],
    };
    for (const [prefix, keys] of Object.entries(families)) {
      for (const key of keys) expect(deKeys.has(`${prefix}.${key}`)).toBe(true);
    }
  });
});
