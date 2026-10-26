import { Inject, Injectable, Logger } from '@nestjs/common';
import type { apiContract } from '@fp/contracts';
import {
  bankAccounts,
  bankConnections,
  finAccounts,
  finRules,
  finTransactions,
  households,
  type Transaction,
} from '@fp/db';
import {
  type CategorizationRule,
  categorize,
  hashBatch,
  type ParsedTransaction,
} from '@fp/domain/finance';
import { toLocalDate } from '@fp/domain/time';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { type In, iso, isoOrNull, OK, type Out } from '../../../common/contract.js';
import { badRequest, notFound, unavailable } from '../../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { ENV, type Env } from '../../../config/env.js';
import { CryptoService } from '../../../infra/crypto.service.js';
import { type Actor, Db } from '../../../infra/database.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import {
  adultMemberIds,
  asCurrency,
  hasFeature,
  once,
  requireFeature,
  visibleAccounts,
} from '../finance-plus.common.js';
import {
  BANK_SYNC_PROVIDER,
  BankProviderError,
  type BankSyncProvider,
  type ProviderSession,
} from './bank-provider.js';

type C = typeof apiContract.financePlus;
type ConnectionRow = typeof bankConnections.$inferSelect;
type BankAccountRow = typeof bankAccounts.$inferSelect;

const DAY = 86_400_000;
/** First sync fetches this much history (PSD2 without SCA usually allows 90 days). */
const INITIAL_DAYS = 90;
/** Later syncs re-read this overlap, so late bookings are picked up (dedupe drops repeats). */
const OVERLAP_DAYS = 30;

export interface SyncOutcome {
  connectionId: string;
  status: ConnectionRow['status'];
  imported: number;
  duplicates: number;
}

const systemActor = (householdId: string): Actor => ({ householdId, memberId: null, userId: null });

@Injectable()
export class BankSyncService {
  private readonly logger = new Logger(BankSyncService.name);

  constructor(
    private readonly db: Db,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
    @Inject(ENV) private readonly env: Env,
    @Inject(BANK_SYNC_PROVIDER) private readonly provider: BankSyncProvider | null,
  ) {}

  // ------------------------------------------------------------ helpers

  private requireProvider(): BankSyncProvider {
    if (!this.provider) throw unavailable('Bank sync is not configured');
    return this.provider;
  }

  private providerFor(conn: ConnectionRow): BankSyncProvider {
    const p = this.requireProvider();
    if (p.id !== conn.provider)
      throw unavailable(`Bank sync provider "${conn.provider}" is not configured`);
    return p;
  }

  private dec(value: string | null): string | null {
    return value ? this.crypto.decrypt(value) : null;
  }

  private session(conn: ConnectionRow): ProviderSession {
    return {
      bankId: conn.bankId,
      externalId: this.dec(conn.externalIdEncrypted),
      externalUser: this.dec(conn.externalUserEncrypted),
      secret: this.dec(conn.secretEncrypted),
      pendingRef: this.dec(conn.pendingRefEncrypted),
    };
  }

  private toConnection(c: ConnectionRow, accounts: BankAccountRow[]) {
    return {
      id: c.id,
      provider: c.provider,
      bankId: c.bankId,
      bankName: c.bankName,
      status: c.status,
      lastSyncedAt: isoOrNull(c.lastSyncedAt),
      lastError: c.lastError,
      consentExpiresAt: isoOrNull(c.consentExpiresAt),
      accounts: accounts
        .filter((a) => a.connectionId === c.id)
        .map((a) => ({
          id: a.id,
          name: a.name,
          ibanLast4: a.ibanLast4,
          currency: asCurrency(a.currency),
          type: a.type,
          accountId: a.accountId,
          lastSyncedAt: isoOrNull(a.lastSyncedAt),
        })),
      createdAt: iso(c.createdAt),
    };
  }

  private async loadConnection(tx: Transaction, id: string): Promise<ConnectionRow> {
    const [c] = await tx.select().from(bankConnections).where(eq(bankConnections.id, id));
    if (!c) throw notFound('Bank connection');
    return c;
  }

  private async connectionDto(tx: Transaction, id: string) {
    const c = await this.loadConnection(tx, id);
    const accounts = await tx
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.connectionId, id))
      .orderBy(bankAccounts.name);
    return this.toConnection(c, accounts);
  }

  // ------------------------------------------------------------ endpoints

  async listBanks(ctx: HouseholdContext, input: In<C['listBanks']>): Promise<Out<C['listBanks']>> {
    requireFeature(ctx, 'bank_sync');
    try {
      return await this.requireProvider().listBanks(input.query.q);
    } catch (e) {
      if (e instanceof BankProviderError) throw unavailable(e.message);
      throw e;
    }
  }

  async listConnections(ctx: HouseholdContext): Promise<Out<C['listConnections']>> {
    requireFeature(ctx, 'bank_sync');
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const conns = await tx.select().from(bankConnections).orderBy(bankConnections.createdAt);
      const accounts = await tx.select().from(bankAccounts).orderBy(bankAccounts.name);
      return conns.map((c) => this.toConnection(c, accounts));
    });
  }

  async start(
    ctx: HouseholdContext,
    input: In<C['startConnection']>,
  ): Promise<Out<C['startConnection']>> {
    requireFeature(ctx, 'bank_sync');
    const provider = this.requireProvider();
    const { bankId } = input.body;
    const state = CryptoService.token(32);
    const callbackUrl = `${this.env.API_PUBLIC_URL}/v1/bank-sync/callback?state=${state}`;
    // Reuse the provider-side user of an earlier connection (one aggregator user per household).
    const [previous] = await this.db.tenant(actorOf(ctx), (tx) =>
      tx
        .select()
        .from(bankConnections)
        .where(
          and(
            eq(bankConnections.provider, provider.id),
            isNotNull(bankConnections.externalUserEncrypted),
          ),
        )
        .limit(1),
    );
    const existingUser = previous ? this.dec(previous.externalUserEncrypted) : null;
    let started;
    let bankName = bankId;
    try {
      bankName = (await provider.listBanks(bankId)).find((b) => b.id === bankId)?.name ?? bankId;
      started = await provider.createConnection(
        CryptoService.sha256(ctx.householdId).slice(0, 32),
        bankId,
        callbackUrl,
        existingUser
          ? { externalUser: existingUser, secret: this.dec(previous?.secretEncrypted ?? null) }
          : undefined,
      );
    } catch (e) {
      if (e instanceof BankProviderError) throw badRequest(e.message, 'bank_provider_error');
      throw e;
    }
    const enc = (v: string | null) => (v ? this.crypto.encrypt(v) : null);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [c] = await tx
        .insert(bankConnections)
        .values({
          householdId: ctx.householdId,
          provider: provider.id,
          bankId,
          bankName,
          status: 'pending',
          externalUserEncrypted: enc(started.externalUser),
          secretEncrypted: enc(started.secret),
          pendingRefEncrypted: enc(started.pendingRef),
          stateHash: CryptoService.sha256(state),
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!c) throw new Error('insert failed');
      ev.changed('bank_connection', c.id, 'created');
      ev.audit('bank_connection.started', 'bank_connection', c.id, { bankId, bankName });
      return { connectionId: c.id, redirectUrl: started.redirectUrl };
    });
  }

  /** Public redirect target after the bank login (identified by the one-time `state`). */
  async callback(input: In<C['bankCallback']>): Promise<Out<C['bankCallback']>> {
    const [conn] = await this.db.system
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.stateHash, CryptoService.sha256(input.query.state)));
    if (!conn) throw notFound('Bank connection');
    const done = await this.finish(conn, systemActor(conn.householdId));
    return {
      connectionId: done.id,
      householdId: done.householdId,
      status: done.status,
      redirectTo: `${this.env.WEB_URL}/finance/bank-sync?connection=${done.id}&status=${done.status}`,
    };
  }

  async complete(
    ctx: HouseholdContext,
    input: In<C['completeConnection']>,
  ): Promise<Out<C['completeConnection']>> {
    requireFeature(ctx, 'bank_sync');
    const conn = await this.db.tenant(actorOf(ctx), (tx) =>
      this.loadConnection(tx, input.params.connectionId),
    );
    await this.finish(conn, actorOf(ctx));
    return this.db.tenant(actorOf(ctx), (tx) => this.connectionDto(tx, conn.id));
  }

  /** Resolves a pending connection at the provider and stores its accounts. */
  private async finish(conn: ConnectionRow, actor: Actor): Promise<ConnectionRow> {
    if (conn.status !== 'pending') return conn;
    const provider = this.providerFor(conn);
    let completed;
    let accounts;
    try {
      const session = this.session(conn);
      completed = await provider.completeConnection(session);
      accounts = await provider.getAccounts({ ...session, externalId: completed.externalId });
    } catch (e) {
      if (!(e instanceof BankProviderError)) throw e;
      await this.db.tenant(actor, async (tx, ev) => {
        await tx
          .update(bankConnections)
          .set({ status: 'error', lastError: e.message.slice(0, 500) })
          .where(eq(bankConnections.id, conn.id));
        ev.changed('bank_connection', conn.id, 'updated');
      });
      throw badRequest(e.message, 'bank_login_failed');
    }
    return this.db.tenant(actor, async (tx, ev) => {
      const [row] = await tx
        .update(bankConnections)
        .set({
          status: 'active',
          externalIdEncrypted: this.crypto.encrypt(completed.externalId),
          consentExpiresAt: completed.consentExpiresAt,
          pendingRefEncrypted: null,
          stateHash: null,
          lastError: null,
        })
        .where(eq(bankConnections.id, conn.id))
        .returning();
      if (!row) throw notFound('Bank connection');
      for (const a of accounts) {
        const iban = a.iban?.replace(/\s/g, '').toUpperCase() || null;
        await tx
          .insert(bankAccounts)
          .values({
            householdId: conn.householdId,
            connectionId: conn.id,
            externalIdEncrypted: this.crypto.encrypt(a.externalId),
            externalKey: CryptoService.sha256(`${conn.id}:${a.externalId}`),
            name: a.name,
            ibanEncrypted: iban ? this.crypto.encrypt(iban) : null,
            ibanLast4: iban ? iban.slice(-4) : null,
            currency: a.currency,
            type: a.type,
          })
          .onConflictDoUpdate({
            target: [bankAccounts.connectionId, bankAccounts.externalKey],
            set: { name: a.name },
          });
      }
      ev.changed('bank_connection', conn.id, 'updated');
      ev.audit('bank_connection.completed', 'bank_connection', conn.id, {
        accounts: accounts.length,
      });
      return row;
    });
  }

  async link(
    ctx: HouseholdContext,
    input: In<C['linkBankAccount']>,
  ): Promise<Out<C['linkBankAccount']>> {
    requireFeature(ctx, 'bank_sync');
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const conn = await this.loadConnection(tx, input.params.connectionId);
      const [ba] = await tx
        .select()
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.id, input.params.bankAccountId),
            eq(bankAccounts.connectionId, conn.id),
          ),
        );
      if (!ba) throw notFound('Bank account');
      let accountId: string;
      if (b.accountId) {
        const [a] = await tx
          .select()
          .from(finAccounts)
          .where(and(eq(finAccounts.id, b.accountId), visibleAccounts(ctx)));
        if (!a) throw badRequest('Unknown account', 'invalid_account');
        if (a.currency !== ba.currency)
          throw badRequest('Account currency does not match', 'currency_mismatch');
        const [taken] = await tx
          .select({ id: bankAccounts.id })
          .from(bankAccounts)
          .where(eq(bankAccounts.accountId, a.id));
        if (taken && taken.id !== ba.id)
          throw badRequest('Account is already synced from another bank account', 'already_linked');
        await tx.update(finAccounts).set({ source: 'sync' }).where(eq(finAccounts.id, a.id));
        accountId = a.id;
      } else {
        const [a] = await tx
          .insert(finAccounts)
          .values({
            householdId: ctx.householdId,
            name: b.name ?? `${ba.name} (${conn.bankName})`.slice(0, 80),
            type: ba.type,
            currency: ba.currency,
            institution: conn.bankName.slice(0, 80),
            ibanEncrypted: ba.ibanEncrypted,
            ibanLast4: ba.ibanLast4,
            visibility: b.visibility,
            ownerMemberId: ctx.member.id,
            source: 'sync',
          })
          .returning();
        if (!a) throw new Error('insert failed');
        ev.changed('account', a.id, 'created');
        accountId = a.id;
      }
      await tx.update(bankAccounts).set({ accountId }).where(eq(bankAccounts.id, ba.id));
      ev.changed('bank_connection', conn.id, 'updated');
      ev.audit('bank_account.linked', 'bank_connection', conn.id, { accountId });
      return this.connectionDto(tx, conn.id);
    });
  }

  async syncNow(
    ctx: HouseholdContext,
    input: In<C['syncConnection']>,
  ): Promise<Out<C['syncConnection']>> {
    requireFeature(ctx, 'bank_sync');
    // Existence check under RLS before the system-level sync.
    await this.db.tenant(actorOf(ctx), (tx) => this.loadConnection(tx, input.params.connectionId));
    return this.sync(ctx.householdId, input.params.connectionId, actorOf(ctx), true);
  }

  async remove(
    ctx: HouseholdContext,
    input: In<C['deleteConnection']>,
  ): Promise<Out<C['deleteConnection']>> {
    requireFeature(ctx, 'bank_sync');
    const conn = await this.db.tenant(actorOf(ctx), (tx) =>
      this.loadConnection(tx, input.params.connectionId),
    );
    if (this.provider?.id === conn.provider && conn.externalIdEncrypted) {
      // Revoke at the aggregator; a failure must not keep the user from removing it here.
      await this.provider.deleteConnection(this.session(conn)).catch((e: unknown) => {
        this.logger.warn(`Revoking bank connection ${conn.id} failed: ${(e as Error).message}`);
      });
    }
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const linked = await tx
        .select({ accountId: bankAccounts.accountId })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.connectionId, conn.id), isNotNull(bankAccounts.accountId)));
      const ids = linked.map((l) => l.accountId).filter((a): a is string => !!a);
      // Accounts and their transactions stay; they become manual accounts.
      if (ids.length)
        await tx.update(finAccounts).set({ source: 'manual' }).where(inArray(finAccounts.id, ids));
      await tx.delete(bankConnections).where(eq(bankConnections.id, conn.id));
      ev.changed('bank_connection', conn.id, 'deleted');
      for (const id of ids) ev.changed('account', id, 'updated');
      ev.audit('bank_connection.deleted', 'bank_connection', conn.id, { bankName: conn.bankName });
    });
    return OK;
  }

  // ------------------------------------------------------------ sync

  private async rules(tx: Transaction): Promise<CategorizationRule[]> {
    return (await tx.select().from(finRules)).map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      scope: r.householdId ? 'household' : 'global',
      priority: r.priority,
      conditions: r.conditions,
      direction: r.direction ?? undefined,
      amountMinMinor: r.amountMinMinor ?? undefined,
      amountMaxMinor: r.amountMaxMinor ?? undefined,
    }));
  }

  /**
   * Imports new booked transactions of all linked accounts: same dedupe hash and rule
   * categorisation as statement imports. Provider failures mark the connection as failed and
   * notify the adults (at most once a day per connection).
   */
  async sync(
    householdId: string,
    connectionId: string,
    actor: Actor,
    manual = false,
    now = new Date(),
  ): Promise<SyncOutcome> {
    const [conn] = await this.db.system
      .select()
      .from(bankConnections)
      .where(
        and(eq(bankConnections.id, connectionId), eq(bankConnections.householdId, householdId)),
      );
    if (!conn) throw notFound('Bank connection');
    if (conn.status === 'pending') {
      if (manual) throw badRequest('The bank login is not completed yet', 'connection_pending');
      return { connectionId, status: 'pending', imported: 0, duplicates: 0 };
    }
    if (conn.consentExpiresAt && conn.consentExpiresAt <= now) {
      await this.setStatus(conn, actor, 'expired', 'The bank consent has expired');
      return { connectionId, status: 'expired', imported: 0, duplicates: 0 };
    }
    const provider = this.providerFor(conn);
    const links = await this.db.system
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.connectionId, conn.id), isNotNull(bankAccounts.accountId)));
    const session = this.session(conn);
    const fetched: { link: BankAccountRow; txs: ParsedTransaction[] }[] = [];
    try {
      for (const link of links) {
        const since = toLocalDate(
          link.lastSyncedAt
            ? new Date(link.lastSyncedAt.getTime() - OVERLAP_DAYS * DAY)
            : new Date(now.getTime() - INITIAL_DAYS * DAY),
          'UTC',
        );
        const externalId = this.crypto.decrypt(link.externalIdEncrypted);
        fetched.push({ link, txs: await provider.getTransactions(session, externalId, since) });
      }
    } catch (e) {
      if (!(e instanceof BankProviderError)) throw e;
      await this.fail(conn, actor, e.message, now);
      return { connectionId, status: 'error', imported: 0, duplicates: 0 };
    }

    return this.db.tenant(actor, async (tx, ev) => {
      const rules = await this.rules(tx);
      let imported = 0;
      let duplicates = 0;
      const categoryIds = new Set<string>();
      for (const { link, txs } of fetched) {
        const [account] = await tx
          .select()
          .from(finAccounts)
          .where(eq(finAccounts.id, link.accountId as string));
        if (!account) continue;
        // Pending bookings change until they are booked; only booked ones are imported.
        const booked = txs.filter((t) => t.status === 'booked' && t.currency === account.currency);
        const hashed = hashBatch(account.id, booked);
        const existing = hashed.length
          ? await tx
              .select({ hash: finTransactions.importHash })
              .from(finTransactions)
              .where(
                and(
                  eq(finTransactions.accountId, account.id),
                  inArray(
                    finTransactions.importHash,
                    hashed.map((h) => h.hash),
                  ),
                ),
              )
          : [];
        const seen = new Set(existing.map((e) => e.hash));
        const fresh = hashed.filter((h) => !seen.has(h.hash));
        duplicates += hashed.length - fresh.length;
        for (let i = 0; i < fresh.length; i += 500) {
          const rows = fresh.slice(i, i + 500).map((h) => {
            const rule = categorize(h.tx, rules);
            if (rule) categoryIds.add(rule.categoryId);
            return {
              householdId,
              accountId: account.id,
              bookingDate: h.tx.bookingDate,
              valueDate: h.tx.valueDate,
              amountMinor: h.tx.amountMinor,
              currency: h.tx.currency,
              counterpartyName: h.tx.counterpartyName,
              counterpartyIban: h.tx.counterpartyIban,
              purpose: h.tx.purpose,
              bookingText: h.tx.bookingText,
              categoryId: rule?.categoryId ?? null,
              ruleId: rule?.id ?? null,
              status: h.tx.status,
              source: 'sync' as const,
              importHash: h.hash,
              bankReference: h.tx.bankReference,
            };
          });
          const inserted = await tx
            .insert(finTransactions)
            .values(rows)
            .onConflictDoNothing()
            .returning({ id: finTransactions.id });
          imported += inserted.length;
          duplicates += rows.length - inserted.length;
        }
        await tx
          .update(bankAccounts)
          .set({ lastSyncedAt: now })
          .where(eq(bankAccounts.id, link.id));
        if (fresh.length > 0) {
          ev.changed('transaction', null, 'created', account.id);
          ev.changed('account', account.id, 'updated');
        }
      }
      await tx
        .update(bankConnections)
        .set({ status: 'active', lastSyncedAt: now, lastError: null })
        .where(eq(bankConnections.id, conn.id));
      ev.changed('bank_connection', conn.id, 'updated');
      if (imported > 0) {
        ev.audit('finance.synced', 'bank_connection', conn.id, { imported });
        ev.emit('finance.budget_check', { categoryIds: [...categoryIds] });
      }
      return { connectionId: conn.id, status: 'active' as const, imported, duplicates };
    });
  }

  private async setStatus(
    conn: ConnectionRow,
    actor: Actor,
    status: ConnectionRow['status'],
    error: string | null,
  ): Promise<void> {
    await this.db.tenant(actor, async (tx, ev) => {
      await tx
        .update(bankConnections)
        .set({ status, lastError: error?.slice(0, 500) ?? null })
        .where(eq(bankConnections.id, conn.id));
      ev.changed('bank_connection', conn.id, 'updated');
    });
  }

  private async fail(conn: ConnectionRow, actor: Actor, message: string, now: Date) {
    await this.setStatus(conn, actor, 'error', message);
    const key = `bank-sync-failed:${conn.id}:${toLocalDate(now, 'UTC')}`;
    if (!(await once(this.db.system, conn.householdId, key))) return;
    await this.notifications.notify({
      householdId: conn.householdId,
      memberIds: await adultMemberIds(this.db.system, conn.householdId),
      type: 'finance.bank_sync_failed',
      message: 'notifications.bankSyncFailed',
      vars: { bank: conn.bankName },
      link: `/finance/bank-sync?connection=${conn.id}`,
    });
  }

  /** Scheduled job: syncs every active connection of households whose plan includes bank sync. */
  async syncAll(now = new Date()): Promise<number> {
    if (!this.provider) return 0;
    const rows = await this.db.system
      .select({
        id: bankConnections.id,
        householdId: bankConnections.householdId,
        plan: households.plan,
      })
      .from(bankConnections)
      .innerJoin(households, eq(households.id, bankConnections.householdId))
      .where(
        and(
          inArray(bankConnections.status, ['active', 'error']),
          eq(bankConnections.provider, this.provider.id),
          isNull(households.deletedAt),
        ),
      );
    let synced = 0;
    for (const r of rows) {
      if (!hasFeature(r.plan, 'bank_sync')) continue;
      try {
        const out = await this.sync(r.householdId, r.id, systemActor(r.householdId), false, now);
        if (out.status === 'active') synced++;
      } catch (e) {
        this.logger.warn(`Bank sync of ${r.id} failed: ${(e as Error).message}`);
      }
    }
    return synced;
  }
}
