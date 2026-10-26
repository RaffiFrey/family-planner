import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  AssistantAction as AssistantActionSchema,
  type AssistantProposal as ProposalDto,
  type apiContract,
  CreateEventBody,
  CreateTaskBody,
  CreateTransactionBody,
} from '@fp/contracts';
import {
  assistantProposals,
  assistantRequests,
  assistantSettings,
  calendarSubscriptions,
  files,
  householdMembers,
  itemHistory,
  listItems,
  lists,
} from '@fp/db';
import {
  type AccountRef,
  type ActionIssue,
  annotatePantry,
  ASSISTANT_DAILY_LIMIT,
  type AssistantAction,
  type AssistantKind,
  AssistantInputError,
  type CaptureContext,
  type CategoryRef,
  dateContext,
  findCategory,
  normalizeIngredients,
  normalizeReceipt,
  PROMPT_RETENTION_DAYS,
  REQUEST_LOG_RETENTION_DAYS,
  retentionCutoff,
  summarizeSpending,
  TOOL_NAMES,
  type ToolCall,
  type ToolName,
  toolCallsToActions,
} from '@fp/domain/assistant';
import { can } from '@fp/domain/permissions';
import { startOfDayInZone, toWallTime } from '@fp/domain/time';
import { and, count, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type In, iso, isoOrNull, type Out } from '../../../common/contract.js';
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  planLimit,
} from '../../../common/errors.js';
import { actorOf, type HouseholdContext, memberCtx } from '../../../common/request-context.js';
import { visibleTo } from '../../../common/visibility.js';
import { ENV, type Env } from '../../../config/env.js';
import { Db } from '../../../infra/database.js';
import { ObjectStorage } from '../../../infra/storage.service.js';
import { entitlementsFor } from '../../billing/entitlements.js';
import { CalendarService } from '../../calendar/calendar.service.js';
import { Queues } from '../../events/queues.js';
import { FinanceService } from '../../finance/finance.service.js';
import { guessCategory, normalizeItem } from '../../lists/categorize-item.js';
import { TasksService } from '../../tasks/tasks.service.js';
import {
  AssistantLlm,
  type ImageMediaType,
  type LlmClient,
  type LlmContent,
  LlmOutputError,
  LlmRefusalError,
  type LlmUsage,
} from './llm.js';
import {
  CAPTURE_SYSTEM,
  INSIGHTS_SYSTEM,
  MEALS_SYSTEM,
  parseToolCall,
  RECEIPT_SYSTEM,
  toolSpecs,
} from './prompts.js';

type C = typeof apiContract.assistant;
type ProposalRow = typeof assistantProposals.$inferSelect;

const IMAGE_TYPES: readonly ImageMediaType[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const RETENTION_JOB = 'assistant-retention';

const ReceiptOutput = z.object({
  merchant: z.string().nullable(),
  date: z.string().nullable(),
  total: z.string(),
  currency: z.string().nullable(),
  lineItems: z.array(
    z.object({ description: z.string(), quantity: z.number().nullable(), amount: z.string() }),
  ),
  categoryKey: z.string().nullable(),
});

const InsightsOutput = z.object({ text: z.string(), tips: z.array(z.string()) });

const MealsOutput = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      prepMinutes: z.number().int().nullable(),
      ingredients: z.array(z.object({ name: z.string(), quantity: z.string().nullable() })),
      steps: z.array(z.string()),
    }),
  ),
});

/** Permission needed to apply each action type (checked against the caller's role). */
const ACTION_PERMISSION = {
  create_event: 'calendar.write',
  create_task: 'tasks.write',
  add_list_items: 'lists.write',
  create_transaction: 'finance.write',
} as const;

const TOOL_PERMISSION: Record<
  ToolName,
  (typeof ACTION_PERMISSION)[keyof typeof ACTION_PERMISSION]
> = ACTION_PERMISSION;

@Injectable()
export class AssistantService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(AssistantService.name);
  /** Calls per household and local day; adjustable for tests. */
  dailyLimit = ASSISTANT_DAILY_LIMIT;

  constructor(
    private readonly db: Db,
    private readonly llm: AssistantLlm,
    private readonly calendar: CalendarService,
    private readonly tasks: TasksService,
    private readonly finance: FinanceService,
    private readonly storage: ObjectStorage,
    private readonly queues: Queues,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queues.on('maintenance', RETENTION_JOB, () => this.purgeExpired());
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.env.RUN_WORKERS) await this.queues.schedule(RETENTION_JOB, 6 * 60 * 60_000);
  }

  // ------------------------------------------------------------ settings & guards

  private planAllows(ctx: HouseholdContext): boolean {
    return entitlementsFor(ctx.household.plan).features.includes('ai_assistant');
  }

  private async usedToday(ctx: HouseholdContext): Promise<number> {
    const since = startOfDayInZone(new Date(), ctx.household.timezone);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const [row] = await tx
        .select({ n: count() })
        .from(assistantRequests)
        .where(gte(assistantRequests.createdAt, since));
      return row?.n ?? 0;
    });
  }

  async settings(ctx: HouseholdContext): Promise<Out<C['settings']>> {
    const [row] = await this.db.tenant(actorOf(ctx), (tx) => tx.select().from(assistantSettings));
    return {
      enabled: row?.enabled ?? false,
      available: this.planAllows(ctx) && this.llm.available,
      consentedAt: isoOrNull(row?.consentedAt),
      consentedByMemberId: row?.consentedByMemberId ?? null,
      dailyLimit: this.dailyLimit,
      usedToday: await this.usedToday(ctx),
    };
  }

  private assertManager(ctx: HouseholdContext): void {
    if (!['owner', 'admin'].includes(ctx.member.role))
      throw forbidden('Only owners and admins can change the assistant setting');
  }

  async enable(ctx: HouseholdContext, _input: In<C['enable']>): Promise<Out<C['enable']>> {
    this.assertManager(ctx);
    if (!this.planAllows(ctx)) throw planLimit('The AI assistant is part of Family Pro');
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const values = {
        enabled: true,
        consentedAt: new Date(),
        consentedByMemberId: ctx.member.id,
        disabledAt: null,
      };
      await tx
        .insert(assistantSettings)
        .values({ householdId: ctx.householdId, ...values })
        .onConflictDoUpdate({ target: assistantSettings.householdId, set: values });
      ev.changed('assistant', null, 'updated');
      ev.audit('assistant.enabled', 'assistant', null);
    });
    return this.settings(ctx);
  }

  async disable(ctx: HouseholdContext): Promise<Out<C['disable']>> {
    this.assertManager(ctx);
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await tx
        .insert(assistantSettings)
        .values({ householdId: ctx.householdId, enabled: false, disabledAt: new Date() })
        .onConflictDoUpdate({
          target: assistantSettings.householdId,
          set: { enabled: false, disabledAt: new Date() },
        });
      ev.changed('assistant', null, 'updated');
      ev.audit('assistant.disabled', 'assistant', null);
    });
    return this.settings(ctx);
  }

  /** Plan → opt-in → configured model → daily quota. Returns the client to use. */
  private async guard(ctx: HouseholdContext): Promise<LlmClient> {
    if (!this.planAllows(ctx)) throw planLimit('The AI assistant is part of Family Pro');
    const [row] = await this.db.tenant(actorOf(ctx), (tx) => tx.select().from(assistantSettings));
    if (!row?.enabled)
      throw new AppError(
        403,
        'assistant_disabled',
        'Forbidden',
        'The assistant has not been enabled for this household',
      );
    const client = this.llm.client();
    if ((await this.usedToday(ctx)) >= this.dailyLimit)
      throw new AppError(
        429,
        'assistant_quota',
        'Too Many Requests',
        'Daily assistant limit reached',
      );
    return client;
  }

  /** Runs one model call and records it (metadata only) in `assistant_requests`. */
  private async call<T extends { usage: LlmUsage }>(
    ctx: HouseholdContext,
    kind: AssistantKind,
    fn: () => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    let usage: LlmUsage | null = null;
    let status: 'ok' | 'error' | 'refused' | 'invalid' = 'ok';
    let errorCode: string | null = null;
    try {
      const result = await fn();
      usage = result.usage;
      return result;
    } catch (e) {
      if (e instanceof LlmRefusalError) {
        status = 'refused';
        usage = e.usage;
        throw new AppError(422, 'assistant_refused', 'Unprocessable', e.message);
      }
      if (e instanceof LlmOutputError) {
        status = 'invalid';
        usage = e.usage;
        throw new AppError(502, 'assistant_invalid_output', 'Bad Gateway', e.message);
      }
      status = 'error';
      if (e instanceof Anthropic.RateLimitError) {
        errorCode = 'rate_limited';
        throw new AppError(
          503,
          'assistant_busy',
          'Service Unavailable',
          'The assistant is busy, please retry',
        );
      }
      if (e instanceof Anthropic.APIError) {
        errorCode = `upstream_${String(e.status ?? 'network')}`;
        this.logger.warn(`Assistant upstream error: ${e.message}`);
        throw new AppError(
          502,
          'assistant_upstream',
          'Bad Gateway',
          'The assistant is unavailable',
        );
      }
      errorCode = 'internal';
      throw e;
    } finally {
      await this.db
        .tenant(actorOf(ctx), (tx) =>
          tx.insert(assistantRequests).values({
            householdId: ctx.householdId,
            memberId: ctx.member.id,
            kind,
            model: usage?.model ?? this.env.ASSISTANT_MODEL,
            status,
            errorCode,
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
            cacheReadTokens: usage?.cacheReadTokens ?? 0,
            latencyMs: Date.now() - started,
          }),
        )
        .catch((e: unknown) => {
          this.logger.warn(`Could not log assistant request: ${(e as Error).message}`);
        });
    }
  }

  // ------------------------------------------------------------ context

  private allowedTools(ctx: HouseholdContext): ToolName[] {
    const m = memberCtx(ctx);
    return TOOL_NAMES.filter((t) => can(m, TOOL_PERMISSION[t]));
  }

  private async readOnlyCalendarIds(ctx: HouseholdContext): Promise<Set<string>> {
    const rows = await this.db.tenant(actorOf(ctx), (tx) =>
      tx.select({ id: calendarSubscriptions.calendarId }).from(calendarSubscriptions),
    );
    return new Set(rows.map((r) => r.id));
  }

  private async captureContext(ctx: HouseholdContext, tools: ToolName[]): Promise<CaptureContext> {
    const readOnly = await this.readOnlyCalendarIds(ctx);
    const calendars = (await this.calendar.listCalendars(ctx)).filter(
      (c) =>
        !readOnly.has(c.id) && (c.visibility !== 'private' || c.ownerMemberId === ctx.member.id),
    );
    const { members, listRows } = await this.db.tenant(actorOf(ctx), async (tx) => ({
      members: await tx
        .select({ id: householdMembers.id, name: householdMembers.displayName })
        .from(householdMembers)
        .where(isNull(householdMembers.removedAt)),
      listRows: await tx
        .select({ id: lists.id, name: lists.name, kind: lists.kind })
        .from(lists)
        .where(
          visibleTo(ctx.member.id, { visibility: lists.visibility, owner: lists.ownerMemberId }),
        )
        .orderBy(lists.createdAt),
    }));
    let categories: CategoryRef[] = [];
    let accounts: AccountRef[] = [];
    if (tools.includes('create_transaction')) {
      categories = (await this.finance.listCategories(ctx))
        .filter((c) => !c.hidden)
        .map((c) => ({ id: c.id, name: c.name, key: c.key, kind: c.kind }));
      accounts = (
        await this.finance.listAccounts(ctx, {
          params: { householdId: ctx.householdId },
          query: { includeArchived: false },
          body: undefined as never,
        })
      ).map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
    }
    return {
      now: new Date(),
      timeZone: ctx.household.timezone,
      currency: ctx.household.currency,
      selfMemberId: ctx.member.id,
      members,
      calendars: calendars.map((c) => ({ id: c.id, name: c.name })),
      lists: listRows,
      categories,
      accounts,
      defaultCalendarId: calendars[0]?.id ?? null,
    };
  }

  private describeContext(ctx: HouseholdContext, c: CaptureContext): string {
    const lines = [
      `Language of the user: ${ctx.locale}`,
      `Date table:\n${dateContext(c.now, c.timeZone, ctx.locale)}`,
      `Household members: ${c.members.map((m) => (m.id === c.selfMemberId ? `${m.name} (the user)` : m.name)).join(', ')}`,
      `Calendars: ${c.calendars.map((x) => x.name).join(', ') || '(none)'}`,
      `Lists: ${c.lists.map((l) => `${l.name} (${l.kind})`).join(', ') || '(none)'}`,
    ];
    if (c.accounts.length > 0 || c.categories.length > 0) {
      lines.push(
        `Accounts: ${c.accounts.map((a) => `${a.name} (${a.currency})`).join(', ') || '(none)'}`,
      );
      lines.push(
        `Expense categories (key: name): ${c.categories
          .filter((x) => x.kind === 'expense')
          .map((x) => `${x.key ?? x.name}: ${x.name}`)
          .join(', ')}`,
      );
      lines.push(`Household currency: ${c.currency}`);
    }
    return lines.join('\n');
  }

  // ------------------------------------------------------------ capture

  async capture(ctx: HouseholdContext, input: In<C['capture']>): Promise<Out<C['capture']>> {
    const client = await this.guard(ctx);
    const tools = this.allowedTools(ctx);
    if (tools.length === 0) throw forbidden();
    const context = await this.captureContext(ctx, tools);
    const res = await this.call(ctx, 'capture', () =>
      client.callTools({
        system: CAPTURE_SYSTEM,
        tools: toolSpecs(tools),
        effort: 'medium',
        content: [
          { type: 'text', text: this.describeContext(ctx, context) },
          { type: 'text', text: `<note>\n${input.body.text}\n</note>` },
        ],
      }),
    );
    const issues: ActionIssue[] = [];
    const calls: ToolCall[] = [];
    const callIndex: number[] = [];
    res.toolCalls.slice(0, 10).forEach((raw, index) => {
      const parsed = parseToolCall(raw, tools);
      if (parsed.ok) {
        calls.push(parsed.call);
        callIndex.push(index);
      } else issues.push({ index, tool: parsed.tool, code: parsed.code, message: parsed.message });
    });
    const converted = toolCallsToActions(calls, context);
    issues.push(...converted.issues.map((i) => ({ ...i, index: callIndex[i.index] ?? i.index })));
    const actions = this.checkActions(converted.actions);
    return this.saveProposal(ctx, {
      kind: 'capture',
      inputText: input.body.text,
      message: res.text || null,
      actions,
      issues: issues.sort((a, b) => a.index - b.index),
    });
  }

  /** Last line of defence: every action must match the public contract. */
  private checkActions(actions: AssistantAction[]): AssistantAction[] {
    return actions.filter((a) => {
      const ok = AssistantActionSchema.safeParse(a).success;
      if (!ok) this.logger.warn(`Dropped invalid assistant action of type ${a.type}`);
      return ok;
    });
  }

  private async saveProposal(
    ctx: HouseholdContext,
    p: {
      kind: 'capture' | 'receipt';
      inputText: string | null;
      message: string | null;
      actions: AssistantAction[];
      issues: ActionIssue[];
      data?: Record<string, unknown>;
    },
  ): Promise<ProposalDto> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [row] = await tx
        .insert(assistantProposals)
        .values({
          householdId: ctx.householdId,
          memberId: ctx.member.id,
          kind: p.kind,
          inputText: p.inputText,
          message: p.message,
          actions: p.actions as unknown as Record<string, unknown>[],
          issues: p.issues as unknown as Record<string, unknown>[],
          data: p.data ?? null,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('assistant', row.id, 'created');
      return this.toProposal(row);
    });
  }

  private toProposal(r: ProposalRow): ProposalDto {
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      message: r.message,
      actions: r.actions as unknown as ProposalDto['actions'],
      issues: r.issues as unknown as ProposalDto['issues'],
      results: r.results,
      createdByMemberId: r.memberId,
      createdAt: iso(r.createdAt),
      appliedAt: isoOrNull(r.appliedAt),
    };
  }

  // ------------------------------------------------------------ receipts

  async receipt(ctx: HouseholdContext, input: In<C['receipt']>): Promise<Out<C['receipt']>> {
    if (!can(memberCtx(ctx), 'finance.write')) throw forbidden();
    const client = await this.guard(ctx);
    const file = await this.db.tenant(actorOf(ctx), async (tx) => {
      const [f] = await tx
        .select()
        .from(files)
        .where(
          and(
            eq(files.id, input.body.fileId),
            isNull(files.deletedAt),
            visibleTo(ctx.member.id, { visibility: files.visibility, owner: files.ownerMemberId }),
          ),
        );
      return f;
    });
    if (!file) throw notFound('File');
    if (file.status !== 'ready') throw conflict('The file is not ready yet', 'file_not_ready');
    const isPdf = file.mimeType === 'application/pdf';
    const image = IMAGE_TYPES.find((t) => t === file.mimeType);
    if (!isPdf && !image) throw badRequest('Receipts must be images or PDFs', 'unsupported_file');
    if (file.sizeBytes > (isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES))
      throw badRequest('The file is too large for extraction', 'file_too_large');
    const data = (await this.storage.getBuffer(file.storageKey)).toString('base64');

    const categories = (await this.finance.listCategories(ctx)).filter(
      (c) => !c.hidden && c.kind === 'expense',
    );
    const keys = categories.map((c) => c.key).filter((k): k is string => !!k);
    const content: LlmContent[] = [
      isPdf ? { type: 'pdf', data } : { type: 'image', mediaType: image as ImageMediaType, data },
      {
        type: 'text',
        text: `Household currency: ${ctx.household.currency}\nCategory keys: ${keys.join(', ')}\nExtract this receipt.`,
      },
    ];
    const res = await this.call(ctx, 'receipt', () =>
      client.structured({
        system: RECEIPT_SYSTEM,
        content,
        schema: ReceiptOutput,
        effort: 'medium',
      }),
    );
    let normalized;
    try {
      normalized = normalizeReceipt(res.data, {
        now: new Date(),
        timeZone: ctx.household.timezone,
        currency: ctx.household.currency,
        categoryKeys: keys,
      });
    } catch (e) {
      if (e instanceof AssistantInputError)
        throw new AppError(422, 'receipt_unreadable', 'Unprocessable', e.message);
      throw e;
    }
    const { receipt, warnings } = normalized;
    const accounts = (
      await this.finance.listAccounts(ctx, {
        params: { householdId: ctx.householdId },
        query: { includeArchived: false },
        body: undefined as never,
      })
    ).filter((a) => a.currency === receipt.currency);
    const category = findCategory(
      receipt.suggestedCategoryKey,
      categories.map((c) => ({ id: c.id, name: c.name, key: c.key, kind: c.kind })),
      'expense',
    );
    const action: AssistantAction = {
      type: 'create_transaction',
      accountId: accounts.length === 1 ? (accounts[0]?.id ?? null) : null,
      bookingDate: receipt.date,
      amountMinor: -receipt.totalMinor,
      currency: receipt.currency,
      counterpartyName: receipt.merchant,
      categoryId: category?.id ?? null,
      purpose: receipt.merchant ?? '',
    };
    const proposal = await this.saveProposal(ctx, {
      kind: 'receipt',
      inputText: null,
      message: null,
      actions: this.checkActions([action]),
      issues: [],
      data: { receipt, fileId: file.id },
    });
    return { receipt, warnings, proposal };
  }

  // ------------------------------------------------------------ insights

  async insights(ctx: HouseholdContext, input: In<C['insights']>): Promise<Out<C['insights']>> {
    if (!can(memberCtx(ctx), 'finance.read')) throw forbidden();
    const client = await this.guard(ctx);
    const now = toWallTime(new Date(), ctx.household.timezone);
    const months: string[] = [];
    for (let i = input.body.months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.year, now.month - 1 - i, 1));
      months.push(d.toISOString().slice(0, 7));
    }
    const params = { householdId: ctx.householdId };
    const cashflow = await this.finance.cashflow(ctx, {
      params,
      query: { from: months[0] as string, to: months.at(-1) as string },
      body: undefined as never,
    });
    const byMonth = [];
    for (const month of months) {
      const [y, m] = month.split('-').map(Number) as [number, number];
      const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      byMonth.push({
        month,
        rows: await this.finance.byCategory(ctx, {
          params,
          query: { from: `${month}-01`, to: last },
          body: undefined as never,
        }),
      });
    }
    const categoryNames = Object.fromEntries(
      (await this.finance.listCategories(ctx)).map((c) => [c.id, c.name]),
    );
    const summary = summarizeSpending({
      currency: ctx.household.currency,
      cashflow,
      byMonth,
      categoryNames,
    });
    // Data minimisation: only the aggregate summary leaves the server.
    const res = await this.call(ctx, 'insights', () =>
      client.structured({
        system: INSIGHTS_SYSTEM,
        schema: InsightsOutput,
        effort: 'low',
        content: [
          {
            type: 'text',
            text: `Language: ${ctx.locale === 'en' ? 'English' : 'German'}\n<data>\n${JSON.stringify(summary)}\n</data>`,
          },
        ],
      }),
    );
    return {
      currency: summary.currency,
      months: summary.months,
      totalIncomeMinor: summary.totalIncomeMinor,
      totalExpenseMinor: summary.totalExpenseMinor,
      avgMonthlyExpenseMinor: summary.avgMonthlyExpenseMinor,
      savingsRatePercent: summary.savingsRatePercent,
      topCategories: summary.topCategories,
      highlights: summary.highlights,
      text: res.data.text.trim(),
      tips: res.data.tips.slice(0, 3),
    };
  }

  // ------------------------------------------------------------ meals

  async meals(ctx: HouseholdContext, input: In<C['meals']>): Promise<Out<C['meals']>> {
    const client = await this.guard(ctx);
    const pantry = normalizeIngredients(input.body.ingredients);
    const res = await this.call(ctx, 'meals', () =>
      client.structured({
        system: MEALS_SYSTEM,
        schema: MealsOutput,
        effort: 'low',
        content: [
          {
            type: 'text',
            text: [
              `Language: ${ctx.locale === 'en' ? 'English' : 'German'}`,
              `Servings: ${input.body.servings}`,
              input.body.preferences ? `Preferences: ${input.body.preferences}` : null,
              `Pantry:\n${pantry.map((p) => `- ${p}`).join('\n')}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      }),
    );
    const ideas = annotatePantry(res.data.ideas.slice(0, 3), pantry).map((i) => ({
      title: i.title,
      description: i.description,
      prepMinutes: i.prepMinutes,
      ingredients: i.ingredients,
      missing: i.missing,
      steps: i.steps,
    }));
    return { ideas };
  }

  // ------------------------------------------------------------ proposals

  private async loadProposal(ctx: HouseholdContext, id: string): Promise<ProposalRow> {
    const [row] = await this.db.tenant(actorOf(ctx), (tx) =>
      tx
        .select()
        .from(assistantProposals)
        .where(and(eq(assistantProposals.id, id), eq(assistantProposals.memberId, ctx.member.id))),
    );
    if (!row) throw notFound('Proposal');
    return row;
  }

  async getProposal(
    ctx: HouseholdContext,
    input: In<C['getProposal']>,
  ): Promise<Out<C['getProposal']>> {
    return this.toProposal(await this.loadProposal(ctx, input.params.proposalId));
  }

  async discard(ctx: HouseholdContext, input: In<C['discard']>): Promise<Out<C['discard']>> {
    const p = await this.loadProposal(ctx, input.params.proposalId);
    if (p.status !== 'pending')
      throw conflict('The proposal is no longer pending', 'proposal_closed');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [row] = await tx
        .update(assistantProposals)
        .set({ status: 'discarded' })
        .where(eq(assistantProposals.id, p.id))
        .returning();
      ev.changed('assistant', p.id, 'updated');
      return this.toProposal(row as ProposalRow);
    });
  }

  async apply(ctx: HouseholdContext, input: In<C['apply']>): Promise<Out<C['apply']>> {
    const p = await this.loadProposal(ctx, input.params.proposalId);
    if (p.status !== 'pending')
      throw conflict('The proposal is no longer pending', 'proposal_closed');
    const actions = z.array(AssistantActionSchema).parse(p.actions);
    const done = new Set(p.results.map((r) => r.index));
    const indexes = (input.body.actionIndexes ?? actions.map((_, i) => i)).filter(
      (i, pos, all) => all.indexOf(i) === pos && !done.has(i),
    );
    for (const i of indexes)
      if (!actions[i]) throw badRequest(`No action ${i}`, 'invalid_action_index');

    // Check everything before executing anything.
    const m = memberCtx(ctx);
    const readOnly = await this.readOnlyCalendarIds(ctx);
    for (const i of indexes) {
      const a = actions[i] as AssistantAction;
      if (!can(m, ACTION_PERMISSION[a.type]))
        throw forbidden(`Not allowed to ${a.type.replace(/_/g, ' ')}`);
      if (a.type === 'create_event' && readOnly.has(a.calendarId))
        throw badRequest('The calendar is read-only', 'calendar_read_only');
      if (a.type === 'create_transaction' && !a.accountId && !input.body.accountId)
        throw badRequest('Choose an account for the transaction', 'account_required');
    }

    const results = [...p.results];
    const persist = (status: 'pending' | 'applied') =>
      this.db.tenant(actorOf(ctx), async (tx, ev) => {
        const [row] = await tx
          .update(assistantProposals)
          .set({ results, status, ...(status === 'applied' ? { appliedAt: new Date() } : {}) })
          .where(eq(assistantProposals.id, p.id))
          .returning();
        ev.changed('assistant', p.id, 'updated');
        if (status === 'applied')
          ev.audit('assistant.applied', 'assistant', p.id, {
            actions: results.map((r) => r.type),
          });
        return row as ProposalRow;
      });
    try {
      for (const i of indexes) {
        const id = await this.execute(ctx, actions[i] as AssistantAction, input.body.accountId);
        results.push({ index: i, type: (actions[i] as AssistantAction).type, id });
      }
    } catch (e) {
      await persist('pending');
      throw e;
    }
    const complete = actions.every((_, i) => results.some((r) => r.index === i));
    return this.toProposal(await persist(complete ? 'applied' : 'pending'));
  }

  /** Executes one action through the owning module's service (its own validation and events). */
  private async execute(
    ctx: HouseholdContext,
    a: AssistantAction,
    fallbackAccountId: string | undefined,
  ): Promise<string> {
    const params = { householdId: ctx.householdId };
    const query = undefined as never;
    switch (a.type) {
      case 'create_event': {
        const { type: _t, ...body } = a;
        const ev = await this.calendar.createEvent(ctx, {
          params,
          query,
          body: CreateEventBody.parse(body),
        });
        return ev.id;
      }
      case 'create_task': {
        const { type: _t, ...body } = a;
        const task = await this.tasks.create(ctx, {
          params,
          query,
          body: CreateTaskBody.parse(body),
        });
        return task.id;
      }
      case 'add_list_items':
        return this.addListItems(ctx, a);
      case 'create_transaction': {
        const accountId = a.accountId ?? (fallbackAccountId as string);
        const tx = await this.finance.createTransaction(ctx, {
          params,
          query,
          body: CreateTransactionBody.parse({
            accountId,
            bookingDate: a.bookingDate,
            amountMinor: a.amountMinor,
            counterpartyName: a.counterpartyName,
            purpose: a.purpose,
            categoryId: a.categoryId,
          }),
        });
        if (tx.currency !== a.currency)
          this.logger.warn(
            `Transaction ${tx.id} booked in ${tx.currency} instead of ${a.currency}`,
          );
        return tx.id;
      }
    }
  }

  /** Adds items like ListsService.addItem (category guess, quick-add history). Returns the list id. */
  private async addListItems(
    ctx: HouseholdContext,
    a: Extract<AssistantAction, { type: 'add_list_items' }>,
  ): Promise<string> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [l] = await tx
        .select()
        .from(lists)
        .where(
          and(
            eq(lists.id, a.listId),
            visibleTo(ctx.member.id, { visibility: lists.visibility, owner: lists.ownerMemberId }),
          ),
        );
      if (!l) throw notFound('List');
      const [max] = await tx
        .select({ p: sql<number>`coalesce(max(${listItems.position}), 0)` })
        .from(listItems)
        .where(eq(listItems.listId, l.id));
      let position = max?.p ?? 0;
      for (const item of a.items) {
        const normalized = normalizeItem(item.text);
        const [known] = await tx
          .select()
          .from(itemHistory)
          .where(eq(itemHistory.normalized, normalized));
        const category = known?.category ?? guessCategory(item.text);
        const [row] = await tx
          .insert(listItems)
          .values({
            householdId: ctx.householdId,
            listId: l.id,
            text: item.text,
            quantity: item.quantity,
            category,
            position: ++position,
          })
          .returning();
        await tx
          .insert(itemHistory)
          .values({ householdId: ctx.householdId, normalized, text: item.text, category })
          .onConflictDoUpdate({
            target: [itemHistory.householdId, itemHistory.normalized],
            set: { uses: sql`${itemHistory.uses} + 1`, lastUsedAt: new Date(), category },
          });
        if (row) ev.changed('list_item', row.id, 'created', l.id);
      }
      await tx.update(lists).set({ updatedAt: new Date() }).where(eq(lists.id, l.id));
      if (l.kind === 'shopping')
        ev.emit('list.item_added', {
          listId: l.id,
          listName: l.name,
          text: a.items.map((i) => i.text).join(', '),
        });
      return l.id;
    });
  }

  // ------------------------------------------------------------ retention

  /** Deletes proposals (they hold prompt contents) after 30 days and old request metadata. */
  async purgeExpired(now = new Date()): Promise<{ proposals: number; requests: number }> {
    const proposals = await this.db.system
      .delete(assistantProposals)
      .where(lt(assistantProposals.createdAt, retentionCutoff(now, PROMPT_RETENTION_DAYS)))
      .returning({ id: assistantProposals.id });
    const requests = await this.db.system
      .delete(assistantRequests)
      .where(lt(assistantRequests.createdAt, retentionCutoff(now, REQUEST_LOG_RETENTION_DAYS)))
      .returning({ id: assistantRequests.id });
    return { proposals: proposals.length, requests: requests.length };
  }
}
