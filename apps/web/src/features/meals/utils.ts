import type { MealPlanEntry, RecipeIngredient } from '@fp/contracts';
import { addDays, format, getISOWeek, startOfISOWeek } from 'date-fns';

export type MealSlot = MealPlanEntry['slot'];
export const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function toLocalDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Parses `yyyy-MM-dd` as a local calendar day (no timezone shift). */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfISOWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isoWeek(d: Date): number {
  return getISOWeek(d);
}

export function slotKey(date: string, slot: MealSlot): string {
  return `${date}|${slot}`;
}

export function parseSlotKey(key: string): { date: string; slot: MealSlot } {
  const [date, slot] = key.split('|');
  return { date: date ?? '', slot: (slot ?? 'dinner') as MealSlot };
}

/** "200 g", "1,5 EL" – the quantity is formatted for the locale. */
export function formatIngredient(
  i: RecipeIngredient,
  locale: string,
  unitLabel: (u: NonNullable<RecipeIngredient['unit']>) => string,
): string {
  const qty =
    i.quantity === null
      ? ''
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(i.quantity);
  return [qty, i.unit ? unitLabel(i.unit) : '', i.name].filter(Boolean).join(' ');
}

/** Accepts "1,5" or "1.5"; empty → null; NaN → undefined (invalid). */
export function parseQuantity(s: string): number | null | undefined {
  const v = s.trim().replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function parseIntOrNull(s: string): number | null | undefined {
  const v = s.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
