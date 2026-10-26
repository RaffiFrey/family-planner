import { Injectable, Logger } from '@nestjs/common';
import type {
  apiContract,
  Contact as ContactDto,
  EmergencyCard as EmergencyCardDto,
} from '@fp/contracts';
import { contacts, emergencyCards, type Transaction } from '@fp/db';
import { lastChars } from '@fp/domain/care';
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { type In, iso, OK, type Out } from '../../../common/contract.js';
import { badRequest, forbidden, notFound } from '../../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { CryptoService } from '../../../infra/crypto.service.js';
import { Db } from '../../../infra/database.js';
import { allowed, assertMembers, loadMember } from '../shared.js';

type C = typeof apiContract.contacts;
type ContactRow = typeof contacts.$inferSelect;
type CardRow = typeof emergencyCards.$inferSelect;

/** How long clients may serve the offline emergency summary before refreshing. */
const SUMMARY_MAX_AGE_SECONDS = 24 * 3600;

export function toContact(c: ContactRow): ContactDto {
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    organization: c.organization,
    phones: c.phones,
    email: c.email,
    address: c.address,
    notes: c.notes,
    memberIds: c.memberIds,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly db: Db,
    private readonly crypto: CryptoService,
  ) {}

  private async load(tx: Transaction, id: string): Promise<ContactRow> {
    const [c] = await tx.select().from(contacts).where(eq(contacts.id, id));
    if (!c) throw notFound('Contact');
    return c;
  }

  /** Validates contact ids of the current household (RLS scopes the lookup). */
  async assertContacts(tx: Transaction, ids: readonly (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((x): x is string => typeof x === 'string'))];
    if (unique.length === 0) return;
    const rows = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(inArray(contacts.id, unique));
    if (rows.length !== unique.length) throw badRequest('Unknown contact', 'unknown_contact');
  }

  async list(ctx: HouseholdContext, input: In<C['list']>): Promise<Out<C['list']>> {
    const q = input.query;
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const pattern = q.q ? `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
      const rows = await tx
        .select()
        .from(contacts)
        .where(
          and(
            q.category ? eq(contacts.category, q.category) : undefined,
            q.memberId ? sql`${q.memberId}::uuid = any(${contacts.memberIds})` : undefined,
            pattern
              ? or(ilike(contacts.name, pattern), ilike(contacts.organization, pattern))
              : undefined,
          ),
        )
        .orderBy(asc(contacts.name));
      return rows.map(toContact);
    });
  }

  async get(ctx: HouseholdContext, input: In<C['get']>): Promise<Out<C['get']>> {
    return this.db.tenant(actorOf(ctx), async (tx) =>
      toContact(await this.load(tx, input.params.contactId)),
    );
  }

  async create(ctx: HouseholdContext, input: In<C['create']>): Promise<Out<C['create']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await assertMembers(tx, b.memberIds);
      const [c] = await tx
        .insert(contacts)
        .values({
          householdId: ctx.householdId,
          name: b.name,
          category: b.category,
          organization: b.organization ?? null,
          phones: b.phones.map((p) => ({ label: p.label, number: p.number })),
          email: b.email ?? null,
          address: b.address ?? null,
          notes: b.notes ?? null,
          memberIds: [...new Set(b.memberIds)],
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!c) throw new Error('insert failed');
      ev.changed('contact', c.id, 'created');
      return toContact(c);
    });
  }

  async update(ctx: HouseholdContext, input: In<C['update']>): Promise<Out<C['update']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const existing = await this.load(tx, input.params.contactId);
      if (b.memberIds) await assertMembers(tx, b.memberIds);
      const { phones, memberIds, ...rest } = b;
      const [c] = await tx
        .update(contacts)
        .set({
          ...rest,
          ...(phones ? { phones: phones.map((p) => ({ label: p.label, number: p.number })) } : {}),
          ...(memberIds ? { memberIds: [...new Set(memberIds)] } : {}),
        })
        .where(eq(contacts.id, existing.id))
        .returning();
      if (!c) throw notFound('Contact');
      ev.changed('contact', c.id, 'updated');
      return toContact(c);
    });
  }

  async remove(ctx: HouseholdContext, input: In<C['remove']>): Promise<Out<C['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const c = await this.load(tx, input.params.contactId);
      await tx.delete(contacts).where(eq(contacts.id, c.id));
      // Drop dangling references from emergency cards.
      await tx
        .update(emergencyCards)
        .set({
          emergencyContactIds: sql`array_remove(${emergencyCards.emergencyContactIds}, ${c.id}::uuid)`,
        })
        .where(sql`${c.id}::uuid = any(${emergencyCards.emergencyContactIds})`);
      ev.changed('contact', c.id, 'deleted');
    });
    return OK;
  }

  // ------------------------------------------------------------------ emergency cards

  /** Insurance numbers are health data: in clear only for the member and health readers. */
  private canSeeInsurance(ctx: HouseholdContext, memberId: string): boolean {
    return memberId === ctx.member.id || allowed(ctx, 'health.read');
  }

  private assertCanEditCard(ctx: HouseholdContext, memberId: string): void {
    if (memberId !== ctx.member.id && !allowed(ctx, 'health.write')) throw forbidden();
  }

  private toCard(ctx: HouseholdContext, c: CardRow): EmergencyCardDto {
    let insuranceNumber: string | null = null;
    if (c.insuranceNumberEncrypted && this.canSeeInsurance(ctx, c.memberId)) {
      try {
        insuranceNumber = this.crypto.decrypt(c.insuranceNumberEncrypted);
      } catch (e) {
        this.logger.error(`Cannot decrypt emergency card ${c.id}: ${(e as Error).message}`);
      }
    }
    return {
      memberId: c.memberId,
      bloodType: (c.bloodType as EmergencyCardDto['bloodType']) ?? null,
      allergies: c.allergies,
      conditions: c.conditions,
      medications: c.medications,
      insuranceProvider: c.insuranceProvider,
      insuranceNumber,
      insuranceNumberLast4: c.insuranceNumberLast4,
      emergencyContactIds: c.emergencyContactIds,
      doctorContactId: c.doctorContactId,
      notes: c.notes,
      updatedAt: iso(c.updatedAt),
    };
  }

  private async loadCard(tx: Transaction, memberId: string): Promise<CardRow | null> {
    const [c] = await tx.select().from(emergencyCards).where(eq(emergencyCards.memberId, memberId));
    return c ?? null;
  }

  async listCards(ctx: HouseholdContext): Promise<Out<C['emergency']['list']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx.select().from(emergencyCards);
      return rows.map((c) => this.toCard(ctx, c));
    });
  }

  async getCard(
    ctx: HouseholdContext,
    input: In<C['emergency']['get']>,
  ): Promise<Out<C['emergency']['get']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const c = await this.loadCard(tx, input.params.memberId);
      if (!c) throw notFound('Emergency card');
      return this.toCard(ctx, c);
    });
  }

  async upsertCard(
    ctx: HouseholdContext,
    input: In<C['emergency']['upsert']>,
  ): Promise<Out<C['emergency']['upsert']>> {
    const memberId = input.params.memberId;
    this.assertCanEditCard(ctx, memberId);
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await loadMember(tx, memberId);
      await this.assertContacts(tx, [...(b.emergencyContactIds ?? []), b.doctorContactId]);
      const { insuranceNumber, emergencyContactIds, ...rest } = b;
      const values: Partial<typeof emergencyCards.$inferInsert> = { ...rest };
      if (emergencyContactIds) values.emergencyContactIds = [...new Set(emergencyContactIds)];
      if (insuranceNumber !== undefined) {
        values.insuranceNumberEncrypted = insuranceNumber
          ? this.crypto.encrypt(insuranceNumber)
          : null;
        values.insuranceNumberLast4 = insuranceNumber ? lastChars(insuranceNumber) : null;
      }
      const existing = await this.loadCard(tx, memberId);
      const [row] = existing
        ? await tx
            .update(emergencyCards)
            .set(values)
            .where(eq(emergencyCards.id, existing.id))
            .returning()
        : await tx
            .insert(emergencyCards)
            .values({ ...values, householdId: ctx.householdId, memberId })
            .returning();
      if (!row) throw new Error('upsert failed');
      ev.changed('emergency_card', row.id, existing ? 'updated' : 'created', memberId);
      ev.audit('emergency_card.updated', 'emergency_card', row.id, { memberId });
      return this.toCard(ctx, row);
    });
  }

  async removeCard(
    ctx: HouseholdContext,
    input: In<C['emergency']['remove']>,
  ): Promise<Out<C['emergency']['remove']>> {
    this.assertCanEditCard(ctx, input.params.memberId);
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const c = await this.loadCard(tx, input.params.memberId);
      if (!c) throw notFound('Emergency card');
      await tx.delete(emergencyCards).where(eq(emergencyCards.id, c.id));
      ev.changed('emergency_card', c.id, 'deleted', c.memberId);
    });
    return OK;
  }

  async summary(
    ctx: HouseholdContext,
    input: In<C['emergency']['summary']>,
  ): Promise<Out<C['emergency']['summary']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const member = await loadMember(tx, input.params.memberId);
      const card = await this.loadCard(tx, member.id);
      const ids = card
        ? [...card.emergencyContactIds, ...(card.doctorContactId ? [card.doctorContactId] : [])]
        : [];
      const rows = ids.length
        ? await tx.select().from(contacts).where(inArray(contacts.id, ids))
        : [];
      const byId = new Map(rows.map((r) => [r.id, toContact(r)]));
      const body = {
        member: {
          id: member.id,
          displayName: member.displayName,
          birthday: member.birthday,
          color: member.color,
        },
        card: card ? this.toCard(ctx, card) : null,
        doctor: card?.doctorContactId ? (byId.get(card.doctorContactId) ?? null) : null,
        emergencyContacts: (card?.emergencyContactIds ?? []).flatMap((id) => {
          const c = byId.get(id);
          return c ? [c] : [];
        }),
      };
      return {
        ...body,
        generatedAt: iso(new Date()),
        version: CryptoService.sha256(JSON.stringify(body)).slice(0, 16),
        maxAgeSeconds: SUMMARY_MAX_AGE_SECONDS,
      };
    });
  }
}
