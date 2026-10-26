export type RuleField = 'counterparty' | 'purpose' | 'iban' | 'bookingText' | 'any';
export type RuleOperator = 'contains' | 'equals' | 'startsWith' | 'regex';

export interface RuleCondition {
  field: RuleField;
  op: RuleOperator;
  value: string;
}

/** Auto-categorisation rule. Household rules win over global ones, then by priority (lower first). */
export interface CategorizationRule {
  id: string;
  categoryId: string;
  scope: 'household' | 'global';
  priority: number;
  /** All conditions must match. */
  conditions: readonly RuleCondition[];
  direction?: 'in' | 'out' | undefined;
  amountMinMinor?: number | undefined;
  amountMaxMinor?: number | undefined;
}

export interface CategorizableTransaction {
  amountMinor: number;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  purpose: string;
  bookingText: string | null;
}

function fieldValues(tx: CategorizableTransaction, field: RuleField): string[] {
  switch (field) {
    case 'counterparty':
      return [tx.counterpartyName ?? ''];
    case 'purpose':
      return [tx.purpose];
    case 'iban':
      return [(tx.counterpartyIban ?? '').replace(/\s/g, '')];
    case 'bookingText':
      return [tx.bookingText ?? ''];
    case 'any':
      return [tx.counterpartyName ?? '', tx.purpose, tx.bookingText ?? ''];
  }
}

const regexCache = new Map<string, RegExp | null>();

function compile(pattern: string): RegExp | null {
  if (!regexCache.has(pattern)) {
    try {
      regexCache.set(pattern, new RegExp(pattern, 'i'));
    } catch {
      regexCache.set(pattern, null);
    }
  }
  return regexCache.get(pattern) ?? null;
}

export function isValidRegex(pattern: string): boolean {
  return compile(pattern) !== null;
}

function matchesCondition(tx: CategorizableTransaction, c: RuleCondition): boolean {
  const needle = c.value.toLowerCase();
  return fieldValues(tx, c.field).some((raw) => {
    const hay = raw.toLowerCase();
    switch (c.op) {
      case 'contains':
        return hay.includes(needle);
      case 'equals':
        return hay.trim() === needle.trim();
      case 'startsWith':
        return hay.startsWith(needle);
      case 'regex':
        return compile(c.value)?.test(raw) ?? false;
    }
  });
}

export function ruleMatches(tx: CategorizableTransaction, rule: CategorizationRule): boolean {
  if (rule.conditions.length === 0) return false;
  if (rule.direction === 'in' && tx.amountMinor < 0) return false;
  if (rule.direction === 'out' && tx.amountMinor >= 0) return false;
  const abs = Math.abs(tx.amountMinor);
  if (rule.amountMinMinor !== undefined && abs < rule.amountMinMinor) return false;
  if (rule.amountMaxMinor !== undefined && abs > rule.amountMaxMinor) return false;
  return rule.conditions.every((c) => matchesCondition(tx, c));
}

export function sortRules(rules: readonly CategorizationRule[]): CategorizationRule[] {
  return [...rules].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === 'household' ? -1 : 1;
    return a.priority - b.priority;
  });
}

/** Returns the matching rule (first by precedence) or null. */
export function categorize(
  tx: CategorizableTransaction,
  rules: readonly CategorizationRule[],
): CategorizationRule | null {
  return sortRules(rules).find((r) => ruleMatches(tx, r)) ?? null;
}
