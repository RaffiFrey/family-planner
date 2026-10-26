import type { ToolCall, ToolName } from '@fp/domain/assistant';
import { z } from 'zod';
import type { LlmToolSpec } from './llm.js';

/**
 * Tool input schemas. They are the single source for both the JSON schema sent to the model and
 * the validation of what comes back (model output is never trusted).
 */

const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.string().describe('Local date YYYY-MM-DD, resolved from the date table');
const time = z.string().describe('Local 24h time HH:mm');

const CreateEventInput = z.object({
  title: text(200),
  date,
  startTime: time.nullish().describe('Local start time HH:mm; omit for all-day events'),
  endTime: time.nullish(),
  durationMinutes: z.number().int().min(0).max(10080).nullish(),
  allDay: z.boolean().nullish(),
  calendar: z.string().max(100).nullish().describe('Calendar name; omit for the default calendar'),
  attendees: z
    .array(z.string().max(100))
    .max(20)
    .nullish()
    .describe('Household member names exactly as listed'),
  location: z.string().max(300).nullish(),
  notes: z.string().max(2000).nullish(),
  rrule: z
    .string()
    .max(300)
    .nullish()
    .describe('RFC 5545 RRULE body for repeating events, e.g. FREQ=WEEKLY;BYDAY=TU'),
  reminderMinutes: z.array(z.number().int().min(0).max(40320)).max(5).nullish(),
});

const CreateTaskInput = z.object({
  title: text(200),
  dueDate: date.nullish(),
  dueTime: time.nullish(),
  assignee: z.string().max(100).nullish().describe('Household member name'),
  repeat: z
    .discriminatedUnion('kind', [
      z.object({
        kind: z.literal('rrule'),
        rrule: z.string().max(300).describe('Fixed calendar rule, e.g. FREQ=WEEKLY;BYDAY=MO'),
      }),
      z.object({
        kind: z.literal('interval'),
        every: z.number().int().min(1).max(1000),
        unit: z.enum(['day', 'week', 'month', 'year']),
      }),
    ])
    .nullish()
    .describe(
      'Repetition. "interval" = N units after the last completion ("alle 3 Tage"); "rrule" = fixed weekdays/dates ("jeden Montag")',
    ),
  rotation: z
    .array(z.string().max(100))
    .max(20)
    .nullish()
    .describe('Members taking turns, in order ("abwechselnd Anna und Ben")'),
  notes: z.string().max(2000).nullish(),
  points: z.number().int().min(0).max(1000).nullish(),
});

const AddListItemsInput = z.object({
  list: z.string().max(100).nullish().describe('List name; omit for the shopping list'),
  items: z
    .array(z.object({ text: text(200), quantity: z.string().max(50).nullish() }))
    .min(1)
    .max(50),
});

const CreateTransactionInput = z.object({
  amount: z.string().max(30).describe('Positive decimal amount as written, e.g. "12,49"'),
  direction: z.enum(['expense', 'income']),
  date: date.nullish(),
  currency: z.string().length(3).nullish(),
  merchant: z.string().max(200).nullish(),
  category: z.string().max(100).nullish().describe('Category key from the list'),
  account: z.string().max(100).nullish(),
  note: z.string().max(500).nullish(),
});

type InputOf<N extends ToolName> = Extract<ToolCall, { name: N }>['input'];

export const TOOL_INPUTS: { [N in ToolName]: z.ZodType<InputOf<N>> } = {
  create_event: CreateEventInput,
  create_task: CreateTaskInput,
  add_list_items: AddListItemsInput,
  create_transaction: CreateTransactionInput,
};

const DESCRIPTIONS: Record<ToolName, string> = {
  create_event:
    'Propose a calendar appointment (doctor, birthday, meeting, trip). Use for things that happen at a date/time.',
  create_task:
    'Propose a to-do or household chore, optionally repeating and rotating between members.',
  add_list_items:
    'Propose adding items to a list (default: shopping list). One call per list with all its items.',
  create_transaction:
    'Propose recording an expense or income the user mentions having paid/received.',
};

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: 'input' }) as Record<
    string,
    unknown
  >;
  return rest;
}

/** Deterministic tool list (stable order keeps the prompt cache valid). */
export function toolSpecs(allowed: readonly ToolName[]): LlmToolSpec[] {
  return (Object.keys(TOOL_INPUTS) as ToolName[])
    .filter((n) => allowed.includes(n))
    .map((name) => ({
      name,
      description: DESCRIPTIONS[name],
      inputSchema: jsonSchema(TOOL_INPUTS[name]),
    }));
}

export type ParsedToolCall =
  { ok: true; call: ToolCall } | { ok: false; tool: string; code: string; message: string };

/** Validates a raw tool call from the model against the allowed tools and their schemas. */
export function parseToolCall(
  raw: { name: string; input: unknown },
  allowed: readonly ToolName[],
): ParsedToolCall {
  if (!(allowed as readonly string[]).includes(raw.name))
    return {
      ok: false,
      tool: raw.name,
      code: 'unknown_tool',
      message: `Tool ${raw.name} is not available`,
    };
  const name = raw.name as ToolName;
  const parsed = TOOL_INPUTS[name].safeParse(raw.input);
  if (!parsed.success)
    return {
      ok: false,
      tool: name,
      code: 'invalid_input',
      message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  return { ok: true, call: { name, input: parsed.data } as ToolCall };
}

// ---------------------------------------------------------------- system prompts (static → cached)

export const CAPTURE_SYSTEM = `You turn short notes from a family organizer app into structured proposals by calling tools.
The user writes German or English. The household context (date table, members, calendars, lists, categories, accounts) is in the user message.

Rules:
- Call one tool per thing to create; several calls in one turn are fine. Never more than 10 calls.
- Dates: resolve relative expressions ("morgen", "nächsten Dienstag", "next Friday") using the date table only. "Nächsten <Wochentag>" means the next such weekday after today.
- Times are local wall times (HH:mm, 24h). Without a time an event is all-day.
- People: use member names exactly as listed. Never invent people. If a person is not a household member, still pass the name as written; the app will flag it.
- Repeating chores: "alle N Tage/Wochen" (every N days after completion) → repeat.kind="interval"; fixed weekdays or dates ("jeden Montag", "am 1. jedes Monats") → repeat.kind="rrule". "Abwechselnd X und Y" → rotation in that order.
- Shopping items go to add_list_items (one call per list, all items in it). Keep item text short, quantities separate.
- Only use create_transaction when it is offered and the user states an amount that was paid or received.
- If the note is unclear or not actionable, call no tool and reply with one short question in the user's language.
- Otherwise add at most one short sentence summarising what you proposed, in the user's language.`;

export const RECEIPT_SYSTEM = `You read photos or scans of shopping receipts and invoices for a family finance app.
Extract exactly what is printed: merchant name, purchase date (YYYY-MM-DD), the total actually paid (as printed, e.g. "23,47"), the ISO 4217 currency, and the line items with their printed amounts.
Pick categoryKey only from the category keys given in the message, or null if none fits.
If a value is not readable, use null (or an empty list). Never guess a total that is not printed.`;

export const INSIGHTS_SYSTEM = `You are the finance assistant of a family organizer app.
You get aggregated spending data as JSON (amounts in minor units, e.g. cents). Write a short, friendly summary (2–4 sentences) and up to three concrete, practical tips.
Use only numbers from the data; format money in the given currency with two decimals. Do not invent transactions or categories. Answer in the requested language.`;

export const MEALS_SYSTEM = `You suggest family-friendly recipes based on what is in the pantry.
Return exactly three ideas that mainly use the given ingredients; common staples (salt, pepper, oil, water) may be assumed.
Give realistic quantities for the requested servings, concise steps and an estimated preparation time in minutes. Answer in the requested language.`;
