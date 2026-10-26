import { currencyExponent, isCurrencyCode, parseAmountToMinor } from '../money/money.js';
import { parseRecurrenceRule, RecurrenceError } from '../recurrence/series.js';
import { type TaskRecurrence, validateTaskRecurrence } from '../recurrence/tasks.js';
import { addFloating, localDateToFloating, toLocalDate } from '../time/time.js';
import {
  AssistantInputError,
  addDaysToLocalDate,
  checkLocalDate,
  localDateTimeToInstant,
} from './dates.js';
import { type NamedRef, normalizeName, resolveMembers, resolveName } from './names.js';

// ---------------------------------------------------------------- context

export interface ListRef extends NamedRef {
  kind: string;
}

export interface CategoryRef extends NamedRef {
  /** Stable key of global categories, e.g. `groceries`. */
  key: string | null;
  kind: 'income' | 'expense' | 'transfer';
}

export interface AccountRef extends NamedRef {
  currency: string;
}

/** What the household looks like to the assistant when it turns tool calls into actions. */
export interface CaptureContext {
  now: Date;
  timeZone: string;
  /** Household currency (fallback for amounts without currency). */
  currency: string;
  selfMemberId: string | null;
  members: readonly NamedRef[];
  calendars: readonly NamedRef[];
  lists: readonly ListRef[];
  categories: readonly CategoryRef[];
  accounts: readonly AccountRef[];
  defaultCalendarId: string | null;
}

// ---------------------------------------------------------------- tool inputs (validated upstream)

type Opt<T> = T | null | undefined;

export interface CreateEventInput {
  title: string;
  /** Local date YYYY-MM-DD. */
  date: string;
  /** Local "HH:mm"; absent → all-day. */
  startTime?: Opt<string>;
  endTime?: Opt<string>;
  durationMinutes?: Opt<number>;
  allDay?: Opt<boolean>;
  calendar?: Opt<string>;
  attendees?: Opt<string[]>;
  location?: Opt<string>;
  notes?: Opt<string>;
  rrule?: Opt<string>;
  reminderMinutes?: Opt<number[]>;
}

export type RepeatInput =
  | { kind: 'rrule'; rrule: string }
  | { kind: 'interval'; every: number; unit: 'day' | 'week' | 'month' | 'year' };

export interface CreateTaskInput {
  title: string;
  dueDate?: Opt<string>;
  dueTime?: Opt<string>;
  assignee?: Opt<string>;
  repeat?: Opt<RepeatInput>;
  /** Members taking turns, in order. */
  rotation?: Opt<string[]>;
  notes?: Opt<string>;
  points?: Opt<number>;
}

export interface AddListItemsInput {
  list?: Opt<string>;
  items: { text: string; quantity?: Opt<string> }[];
}

export interface CreateTransactionInput {
  /** Decimal amount as written, e.g. "12,49" or "12.49". Always positive. */
  amount: string;
  direction: 'expense' | 'income';
  date?: Opt<string>;
  currency?: Opt<string>;
  merchant?: Opt<string>;
  /** Category key (`groceries`) or name. */
  category?: Opt<string>;
  account?: Opt<string>;
  note?: Opt<string>;
}

export type ToolCall =
  | { name: 'create_event'; input: CreateEventInput }
  | { name: 'create_task'; input: CreateTaskInput }
  | { name: 'add_list_items'; input: AddListItemsInput }
  | { name: 'create_transaction'; input: CreateTransactionInput };

export type ToolName = ToolCall['name'];
export const TOOL_NAMES: readonly ToolName[] = [
  'create_event',
  'create_task',
  'add_list_items',
  'create_transaction',
];

// ---------------------------------------------------------------- actions (what apply executes)

export interface CreateEventAction {
  type: 'create_event';
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  timezone: string;
  rrule: string | null;
  attendeeMemberIds: string[];
  reminders: number[];
}

export interface CreateTaskAction {
  type: 'create_task';
  title: string;
  notes: string | null;
  dueAt: string | null;
  assigneeMemberId: string | null;
  recurrence: TaskRecurrence | null;
  rotationMemberIds: string[];
  points: number;
}

export interface AddListItemsAction {
  type: 'add_list_items';
  listId: string;
  items: { text: string; quantity: string | null }[];
}

export interface CreateTransactionAction {
  type: 'create_transaction';
  /** Null when the account could not be determined; the client picks one when applying. */
  accountId: string | null;
  bookingDate: string;
  /** Signed: negative for expenses. */
  amountMinor: number;
  currency: string;
  counterpartyName: string | null;
  categoryId: string | null;
  purpose: string;
}

export type AssistantAction =
  CreateEventAction | CreateTaskAction | AddListItemsAction | CreateTransactionAction;

export interface ActionIssue {
  /** Index of the tool call the issue belongs to. */
  index: number;
  tool: string;
  code: string;
  message: string;
}

export interface ConversionResult {
  actions: AssistantAction[];
  issues: ActionIssue[];
}

/** Default time for tasks that only have a date (end of the afternoon). */
export const DEFAULT_TASK_TIME = '18:00';
export const DEFAULT_EVENT_MINUTES = 60;

// ---------------------------------------------------------------- conversion

const clean = (s: Opt<string>): string | null => {
  const t = s?.trim();
  return t ? t : null;
};

function members(ctx: CaptureContext, names: readonly string[]): string[] {
  const r = resolveMembers(names, ctx.members, ctx.selfMemberId);
  if (r.unknown.length > 0)
    throw new AssistantInputError(
      'unknown_member',
      `Unknown household member: ${r.unknown.join(', ')}`,
    );
  return r.ids;
}

function rrule(rule: string): string {
  const body = rule.trim().replace(/^RRULE:/i, '');
  try {
    parseRecurrenceRule(body);
  } catch (e) {
    throw new AssistantInputError('invalid_recurrence', (e as Error).message);
  }
  return body.toUpperCase();
}

function toEvent(input: CreateEventInput, ctx: CaptureContext): CreateEventAction {
  const date = checkLocalDate(input.date);
  let calendarId = ctx.defaultCalendarId;
  if (clean(input.calendar)) {
    const cal = resolveName(input.calendar as string, ctx.calendars);
    if (!cal)
      throw new AssistantInputError(
        'unknown_calendar',
        `Unknown calendar "${input.calendar as string}"`,
      );
    calendarId = cal.id;
  }
  if (!calendarId) throw new AssistantInputError('unknown_calendar', 'No calendar available');
  const startTime = clean(input.startTime);
  const allDay = input.allDay === true || !startTime;
  let start: Date;
  let end: Date;
  if (allDay) {
    start = localDateToFloating(date);
    end = addFloating(start, 1, 'day');
  } else {
    start = localDateTimeToInstant(date, startTime, ctx.timeZone);
    const endTime = clean(input.endTime);
    if (endTime) {
      end = localDateTimeToInstant(date, endTime, ctx.timeZone);
      // "22:00–01:00" ends on the next day.
      if (end <= start)
        end = localDateTimeToInstant(addDaysToLocalDate(date, 1), endTime, ctx.timeZone);
    } else {
      const minutes = input.durationMinutes ?? DEFAULT_EVENT_MINUTES;
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 7 * 24 * 60)
        throw new AssistantInputError('invalid_input', 'durationMinutes out of range');
      end = new Date(start.getTime() + minutes * 60_000);
    }
  }
  const reminders = [...new Set(input.reminderMinutes ?? [])]
    .filter((m) => Number.isInteger(m) && m >= 0 && m <= 40320)
    .slice(0, 5);
  return {
    type: 'create_event',
    calendarId,
    title: input.title.trim(),
    description: clean(input.notes),
    location: clean(input.location),
    start: start.toISOString(),
    end: end.toISOString(),
    allDay,
    timezone: ctx.timeZone,
    rrule: clean(input.rrule) ? rrule(input.rrule as string) : null,
    attendeeMemberIds: members(ctx, input.attendees ?? []),
    reminders,
  };
}

function toRecurrence(repeat: RepeatInput): TaskRecurrence {
  const r: TaskRecurrence =
    repeat.kind === 'rrule'
      ? { mode: 'fixed', rrule: rrule(repeat.rrule) }
      : { mode: 'floating', interval: repeat.every, unit: repeat.unit };
  try {
    validateTaskRecurrence(r);
  } catch (e) {
    if (e instanceof RecurrenceError)
      throw new AssistantInputError('invalid_recurrence', e.message);
    throw e;
  }
  return r;
}

function toTask(input: CreateTaskInput, ctx: CaptureContext): CreateTaskAction {
  const recurrence = input.repeat ? toRecurrence(input.repeat) : null;
  const rotation = members(ctx, input.rotation ?? []);
  const assignee = clean(input.assignee)
    ? (members(ctx, [input.assignee as string])[0] ?? null)
    : null;
  // Recurring chores need a first due date; default to today.
  const dueDate =
    clean(input.dueDate) ??
    (recurrence || clean(input.dueTime) ? toLocalDate(ctx.now, ctx.timeZone) : null);
  const dueAt = dueDate
    ? localDateTimeToInstant(dueDate, clean(input.dueTime) ?? DEFAULT_TASK_TIME, ctx.timeZone)
    : null;
  const points = input.points ?? 0;
  return {
    type: 'create_task',
    title: input.title.trim(),
    notes: clean(input.notes),
    dueAt: dueAt ? dueAt.toISOString() : null,
    assigneeMemberId: assignee ?? rotation[0] ?? null,
    recurrence,
    rotationMemberIds: rotation,
    points: Number.isInteger(points) && points >= 0 && points <= 1000 ? points : 0,
  };
}

const SHOPPING_WORDS = new Set([
  'einkaufsliste',
  'einkauf',
  'einkaufen',
  'shopping',
  'shopping list',
  'groceries',
]);

function toListItems(input: AddListItemsInput, ctx: CaptureContext): AddListItemsAction {
  const name = clean(input.list);
  const shopping = ctx.lists.find((l) => l.kind === 'shopping');
  let list: ListRef | null | undefined = name ? resolveName(name, ctx.lists) : shopping;
  if (!list && name && SHOPPING_WORDS.has(normalizeName(name))) list = shopping;
  if (!list) throw new AssistantInputError('unknown_list', `Unknown list "${name ?? ''}"`);
  const items = input.items
    .map((i) => ({ text: i.text.trim(), quantity: clean(i.quantity) }))
    .filter((i) => i.text !== '');
  if (items.length === 0) throw new AssistantInputError('invalid_input', 'No items');
  return { type: 'add_list_items', listId: list.id, items };
}

/** Parses a decimal amount written either German ("1.234,56") or English ("1,234.56") style. */
export function parseDecimalAmount(amount: string, currency: string): number {
  if (!isCurrencyCode(currency))
    throw new AssistantInputError('invalid_amount', `Unsupported currency "${currency}"`);
  const s = amount.trim();
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let style: 'de' | 'en';
  if (lastComma >= 0 && lastDot >= 0) style = lastComma > lastDot ? 'de' : 'en';
  // A lone separator followed by exactly three digits is a thousands separator ("1.234").
  else if (lastComma >= 0) style = /,\d{3}$/.test(s) ? 'en' : 'de';
  else style = /\.\d{3}$/.test(s) ? 'de' : 'en';
  try {
    return Math.abs(parseAmountToMinor(s, currencyExponent(currency), style));
  } catch {
    throw new AssistantInputError('invalid_amount', `Invalid amount "${amount}"`);
  }
}

/** Matches a category by key or name, preferring categories of the expected kind. */
export function findCategory(
  query: string | null,
  categories: readonly CategoryRef[],
  kind: CategoryRef['kind'],
): CategoryRef | null {
  if (!query) return null;
  const q = query.trim().toLowerCase();
  const sameKind = categories.filter((c) => c.kind === kind);
  return (
    sameKind.find((c) => c.key === q) ??
    resolveName(query, sameKind) ??
    categories.find((c) => c.key === q) ??
    null
  );
}

function toTransaction(
  input: CreateTransactionInput,
  ctx: CaptureContext,
): CreateTransactionAction {
  const currency = (clean(input.currency) ?? ctx.currency).toUpperCase();
  const minor = parseDecimalAmount(input.amount, currency);
  if (minor === 0) throw new AssistantInputError('invalid_amount', 'Amount must not be zero');
  const date = clean(input.date)
    ? checkLocalDate(input.date as string)
    : toLocalDate(ctx.now, ctx.timeZone);
  const accountName = clean(input.account);
  let accountId: string | null = null;
  if (accountName) {
    const acc = resolveName(accountName, ctx.accounts);
    if (!acc) throw new AssistantInputError('unknown_account', `Unknown account "${accountName}"`);
    accountId = acc.id;
  } else {
    const candidates = ctx.accounts.filter((a) => a.currency === currency);
    if (candidates.length === 1) accountId = (candidates[0] as AccountRef).id;
  }
  const category = findCategory(
    clean(input.category),
    ctx.categories,
    input.direction === 'expense' ? 'expense' : 'income',
  );
  const merchant = clean(input.merchant);
  return {
    type: 'create_transaction',
    accountId,
    bookingDate: date,
    amountMinor: input.direction === 'expense' ? -minor : minor,
    currency,
    counterpartyName: merchant,
    categoryId: category?.id ?? null,
    purpose: clean(input.note) ?? merchant ?? '',
  };
}

/** Converts one validated tool call into an action (throws AssistantInputError on bad references). */
export function toolCallToAction(call: ToolCall, ctx: CaptureContext): AssistantAction {
  switch (call.name) {
    case 'create_event':
      return toEvent(call.input, ctx);
    case 'create_task':
      return toTask(call.input, ctx);
    case 'add_list_items':
      return toListItems(call.input, ctx);
    case 'create_transaction':
      return toTransaction(call.input, ctx);
  }
}

/**
 * Converts all tool calls; calls that reference unknown members, lists etc. become issues
 * instead of actions, so the user sees what could not be understood.
 */
export function toolCallsToActions(
  calls: readonly ToolCall[],
  ctx: CaptureContext,
): ConversionResult {
  const actions: AssistantAction[] = [];
  const issues: ActionIssue[] = [];
  calls.forEach((call, index) => {
    try {
      actions.push(toolCallToAction(call, ctx));
    } catch (e) {
      if (!(e instanceof AssistantInputError)) throw e;
      issues.push({ index, tool: call.name, code: e.code, message: e.message });
    }
  });
  return { actions, issues };
}
