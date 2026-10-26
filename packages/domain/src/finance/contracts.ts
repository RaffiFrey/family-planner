import { addFloating, floatingToLocalDate, localDateToFloating } from '../time/time.js';

/** Billing cadence of a contract or detected recurring payment. */
export type ContractInterval = 'weekly' | 'monthly' | 'quarterly' | 'halfyearly' | 'yearly';
export type ContractType = 'subscription' | 'insurance' | 'utility' | 'loan' | 'other';

export const CONTRACT_INTERVALS: readonly ContractInterval[] = [
  'weekly',
  'monthly',
  'quarterly',
  'halfyearly',
  'yearly',
];

interface Cadence {
  interval: ContractInterval;
  /** Accepted gap between two payments in days (inclusive). */
  minDays: number;
  maxDays: number;
  /** Payments needed before we suggest the contract. */
  minOccurrences: number;
  step: { amount: number; unit: 'week' | 'month' };
  perYear: number;
}

const CADENCES: readonly Cadence[] = [
  {
    interval: 'weekly',
    minDays: 6,
    maxDays: 8,
    minOccurrences: 4,
    step: { amount: 1, unit: 'week' },
    perYear: 52,
  },
  {
    interval: 'monthly',
    minDays: 26,
    maxDays: 35,
    minOccurrences: 3,
    step: { amount: 1, unit: 'month' },
    perYear: 12,
  },
  {
    interval: 'quarterly',
    minDays: 83,
    maxDays: 99,
    minOccurrences: 2,
    step: { amount: 3, unit: 'month' },
    perYear: 4,
  },
  {
    interval: 'halfyearly',
    minDays: 170,
    maxDays: 195,
    minOccurrences: 2,
    step: { amount: 6, unit: 'month' },
    perYear: 2,
  },
  {
    interval: 'yearly',
    minDays: 350,
    maxDays: 380,
    minOccurrences: 2,
    step: { amount: 12, unit: 'month' },
    perYear: 1,
  },
];

const cadenceOf = (interval: ContractInterval): Cadence =>
  CADENCES.find((c) => c.interval === interval) as Cadence;

const LEGAL_FORMS =
  /\b(gmbh|ag|se|kg|kgaa|ohg|ug|co|inc|ltd|llc|plc|sarl|s\.?a|e\.?\s?v|b\.?v|mbh|haftungsbeschrankt)\b/g;

/**
 * Normalises a counterparty name for grouping: "Netflix International B.V." and
 * "NETFLIX.COM 4711" both become "netflix". Digits (customer/reference numbers),
 * legal forms and punctuation are dropped.
 */
export function normalizeCounterparty(name: string | null | undefined): string {
  if (!name) return '';
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\.(com|de|net|org|eu|io|at|ch)\b/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z&\s.]/g, ' ')
    .replace(LEGAL_FORMS, ' ')
    .replace(/[.&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base;
}

/** Grouping key: the counterparty IBAN when present, otherwise the normalised name. */
export function counterpartyKey(tx: {
  counterpartyName: string | null;
  counterpartyIban: string | null;
}): string {
  const iban = tx.counterpartyIban?.replace(/\s/g, '').toUpperCase();
  if (iban && /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban)) return `iban:${iban}`;
  const name = normalizeCounterparty(tx.counterpartyName);
  return name ? `name:${name}` : '';
}

export interface RecurringInput {
  id?: string;
  /** YYYY-MM-DD */
  bookingDate: string;
  /** Signed: negative = outgoing. */
  amountMinor: number;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  categoryId?: string | null;
  accountId?: string | null;
}

export interface RecurringCandidate {
  /** Stable identifier of the candidate (direction, cadence, counterparty, typical amount). */
  key: string;
  counterpartyKey: string;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  direction: 'in' | 'out';
  interval: ContractInterval;
  /** Positive average amount. */
  averageAmountMinor: number;
  lastAmountMinor: number;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  nextExpectedDate: string;
  /** 0..1 */
  confidence: number;
  categoryId: string | null;
  accountId: string | null;
  transactionIds: string[];
}

export interface DetectOptions {
  /** Reference date (YYYY-MM-DD); payments that stopped long before are not suggested. */
  today?: string;
  /** Relative amount tolerance within one contract (default 15 %). */
  amountTolerance?: number;
  /** Candidates below this confidence are dropped (default 0.5). */
  minConfidence?: number;
}

const DAY = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round((localDateToFloating(b).getTime() - localDateToFloating(a).getTime()) / DAY);
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

function mostCommon<T>(values: readonly T[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/** Adds `n` cadence steps to a date, keeping the day of month (clamped at month end). */
export function addInterval(date: string, interval: ContractInterval, n = 1): string {
  const c = cadenceOf(interval);
  return floatingToLocalDate(
    addFloating(localDateToFloating(date), c.step.amount * n, c.step.unit),
  );
}

/** First due date on or after `today`, stepping forward from `date` by the cadence. */
export function rollForward(date: string, interval: ContractInterval, today: string): string {
  if (date >= today) return date;
  // Step from the anchor (not the previous result) so month-end clamping does not drift.
  for (let n = 1; n < 10_000; n++) {
    const next = addInterval(date, interval, n);
    if (next >= today) return next;
  }
  /* c8 ignore next */
  return today;
}

/** Splits a counterparty's payments into clusters of similar amounts (e.g. two Amazon plans). */
function clusterByAmount<T extends { amountMinor: number }>(txs: T[], tolerance: number): T[][] {
  const sorted = [...txs].sort((a, b) => Math.abs(a.amountMinor) - Math.abs(b.amountMinor));
  const clusters: T[][] = [];
  for (const tx of sorted) {
    const current = clusters.at(-1);
    const ref = current ? median(current.map((t) => Math.abs(t.amountMinor))) : 0;
    if (current && Math.abs(Math.abs(tx.amountMinor) - ref) <= ref * tolerance + 100) {
      current.push(tx);
    } else {
      clusters.push([tx]);
    }
  }
  return clusters;
}

function detectCluster(
  group: string,
  txs: RecurringInput[],
  direction: 'in' | 'out',
  options: Required<Pick<DetectOptions, 'amountTolerance'>> & DetectOptions,
): RecurringCandidate | null {
  // Several bookings on the same day (e.g. a correction) count once.
  const byDate = new Map<string, RecurringInput>();
  for (const t of [...txs].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate)))
    byDate.set(t.bookingDate, t);
  const items = [...byDate.values()];
  if (items.length < 2) return null;
  const gaps = items
    .slice(1)
    .map((t, i) => daysBetween((items[i] as RecurringInput).bookingDate, t.bookingDate));
  const typical = median(gaps);
  const cadence = CADENCES.find((c) => typical >= c.minDays && typical <= c.maxDays);
  if (!cadence || items.length < cadence.minOccurrences) return null;

  const regular = gaps.filter((g) => g >= cadence.minDays && g <= cadence.maxDays).length;
  const regularity = regular / gaps.length;
  const amounts = items.map((t) => Math.abs(t.amountMinor));
  const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  const spread = avg > 0 ? (Math.max(...amounts) - Math.min(...amounts)) / avg : 0;
  const stability = Math.max(0, 1 - spread / Math.max(options.amountTolerance * 2, 0.01));
  const volume = Math.min(1, items.length / (cadence.minOccurrences + 3));
  let confidence = regularity * 0.6 + stability * 0.25 + volume * 0.15;

  const last = items.at(-1) as RecurringInput;
  const next = addInterval(last.bookingDate, cadence.interval);
  if (options.today) {
    // Overdue by more than half a cycle (plus a grace week): probably cancelled.
    const overdue = daysBetween(next, options.today);
    if (overdue > cadence.maxDays / 2 + 7) return null;
    if (overdue > 7) confidence *= 0.8;
  }
  confidence = Math.round(confidence * 100) / 100;
  if (confidence < (options.minConfidence ?? 0.5)) return null;

  const typicalAmount = Math.round(median(amounts));
  return {
    key: `${direction}:${cadence.interval}:${group}:${typicalAmount}`,
    counterpartyKey: group,
    counterpartyName: last.counterpartyName,
    counterpartyIban: last.counterpartyIban,
    direction,
    interval: cadence.interval,
    averageAmountMinor: Math.round(avg),
    lastAmountMinor: Math.abs(last.amountMinor),
    occurrences: items.length,
    firstDate: (items[0] as RecurringInput).bookingDate,
    lastDate: last.bookingDate,
    nextExpectedDate: next,
    confidence,
    categoryId: mostCommon(items.map((t) => t.categoryId ?? null).filter((c) => c !== null)),
    accountId: last.accountId ?? null,
    transactionIds: txs.flatMap((t) => (t.id ? [t.id] : [])),
  };
}

/**
 * Finds recurring payments (subscriptions, insurance premiums, rent, salary …): transactions
 * are grouped by counterparty (IBAN or normalised name) and direction, split into clusters of
 * similar amounts, and each cluster is checked for a weekly … yearly cadence.
 * Sorted by confidence, most likely first.
 */
export function detectRecurringPayments(
  txs: readonly RecurringInput[],
  options: DetectOptions = {},
): RecurringCandidate[] {
  const opts = { amountTolerance: 0.15, ...options };
  const groups = new Map<string, RecurringInput[]>();
  for (const tx of txs) {
    if (tx.amountMinor === 0) continue;
    const key = counterpartyKey(tx);
    if (!key) continue;
    const g = `${tx.amountMinor < 0 ? 'out' : 'in'}|${key}`;
    groups.set(g, [...(groups.get(g) ?? []), tx]);
  }
  const out: RecurringCandidate[] = [];
  for (const [g, items] of groups) {
    const [direction, key] = g.split('|') as ['in' | 'out', string];
    for (const cluster of clusterByAmount(items, opts.amountTolerance)) {
      const c = detectCluster(key, cluster, direction, opts);
      if (c) out.push(c);
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key));
}

/** Whether a detected candidate is already covered by a stored contract (or a dismissal). */
export function candidateMatches(
  candidate: Pick<RecurringCandidate, 'counterpartyKey' | 'direction' | 'averageAmountMinor'>,
  contract: { counterpartyKey: string | null; direction: 'in' | 'out'; amountMinor: number },
  tolerance = 0.25,
): boolean {
  if (!contract.counterpartyKey || contract.counterpartyKey !== candidate.counterpartyKey)
    return false;
  if (contract.direction !== candidate.direction) return false;
  const ref = Math.max(contract.amountMinor, 1);
  return Math.abs(candidate.averageAmountMinor - contract.amountMinor) <= ref * tolerance + 100;
}

const TYPE_BY_CATEGORY: Record<string, ContractType> = {
  insurance: 'insurance',
  utilities: 'utility',
  electricity: 'utility',
  internet: 'utility',
  subscriptions: 'subscription',
};

const TYPE_KEYWORDS: [RegExp, ContractType][] = [
  [/versicherung|allianz|huk|axa|ergo|debeka|generali|signal iduna|devk|insurance/, 'insurance'],
  [/kredit|darlehen|finanzierung|leasing|loan|tilgung/, 'loan'],
  [
    /stadtwerke|strom|energie|gas|wasser|vodafone|telekom|telefonica|o2|congstar|1&1|eon|vattenfall|rundfunk/,
    'utility',
  ],
  [
    /netflix|spotify|disney|amazon prime|prime video|apple|google|youtube|dazn|sky|audible|adobe|microsoft|fitness|abo/,
    'subscription',
  ],
];

/** Best guess for the contract type from the category key and the counterparty. */
export function guessContractType(
  categoryKey: string | null | undefined,
  counterpartyName: string | null | undefined,
): ContractType {
  if (categoryKey && TYPE_BY_CATEGORY[categoryKey]) return TYPE_BY_CATEGORY[categoryKey];
  const name = (counterpartyName ?? '').toLowerCase();
  for (const [re, type] of TYPE_KEYWORDS) if (re.test(name)) return type;
  return 'other';
}

/** Amount per year for a payment of `amountMinor` every `interval`. */
export function yearlyAmount(amountMinor: number, interval: ContractInterval): number {
  return amountMinor * cadenceOf(interval).perYear;
}

/** Average monthly amount (rounded) for a payment every `interval`. */
export function monthlyAmount(amountMinor: number, interval: ContractInterval): number {
  return Math.round(yearlyAmount(amountMinor, interval) / 12);
}

export interface NoticeInput {
  /** Next renewal / due date (auto-renewing contracts can be cancelled towards it). */
  nextDueDate: string | null;
  /** End of the minimum term, if any. */
  minimumTermEnd: string | null;
  noticePeriodDays: number | null;
}

/**
 * Last day on which notice can be given so the contract ends at the next possible date:
 * the minimum term end while it lies ahead, otherwise the next renewal. Null without a
 * notice period or end date.
 */
export function cancellationDeadline(c: NoticeInput, today: string): string | null {
  if (c.noticePeriodDays === null) return null;
  const end =
    c.minimumTermEnd && c.minimumTermEnd >= today ? c.minimumTermEnd : (c.nextDueDate ?? null);
  if (!end) return null;
  return floatingToLocalDate(addFloating(localDateToFloating(end), -c.noticePeriodDays, 'day'));
}

/** Days from `today` until `date` (negative when in the past). */
export function daysUntil(date: string, today: string): number {
  return daysBetween(today, date);
}

export interface ContractTotalsInput {
  contractType: ContractType;
  direction: 'in' | 'out';
  amountMinor: number;
  interval: ContractInterval;
}

export interface ContractTotals {
  contractType: ContractType;
  count: number;
  monthlyMinor: number;
  yearlyMinor: number;
}

/** Monthly and yearly cost per contract type (outgoing contracts only) plus the overall total. */
export function contractTotals(contracts: readonly ContractTotalsInput[]): {
  byType: ContractTotals[];
  monthlyMinor: number;
  yearlyMinor: number;
  monthlyIncomeMinor: number;
} {
  const map = new Map<ContractType, ContractTotals>();
  let yearly = 0;
  let income = 0;
  for (const c of contracts) {
    const y = yearlyAmount(c.amountMinor, c.interval);
    if (c.direction === 'in') {
      income += y;
      continue;
    }
    const t = map.get(c.contractType) ?? {
      contractType: c.contractType,
      count: 0,
      monthlyMinor: 0,
      yearlyMinor: 0,
    };
    t.count++;
    t.yearlyMinor += y;
    t.monthlyMinor = Math.round(t.yearlyMinor / 12);
    map.set(c.contractType, t);
    yearly += y;
  }
  return {
    byType: [...map.values()].sort((a, b) => b.yearlyMinor - a.yearlyMinor),
    monthlyMinor: Math.round(yearly / 12),
    yearlyMinor: yearly,
    monthlyIncomeMinor: Math.round(income / 12),
  };
}
