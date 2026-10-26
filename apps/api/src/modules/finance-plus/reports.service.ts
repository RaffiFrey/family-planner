import { Injectable } from '@nestjs/common';
import type { apiContract } from '@fp/contracts';
import { finAccounts, finCategories, finTransactions, type Transaction } from '@fp/db';
import {
  categoryTrends,
  monthsBetween,
  netWorthHistory,
  toCsv,
  yearOverYear,
} from '@fp/domain/finance';
import { currencyExponent, minorToDecimalString } from '@fp/domain/money';
import { categoryLabel } from '@fp/i18n';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { In, Out } from '../../common/contract.js';
import { badRequest } from '../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../common/request-context.js';
import { Db } from '../../infra/database.js';
import {
  asCurrency,
  householdCurrency,
  requireFeature,
  visibleAccounts,
} from './finance-plus.common.js';

type C = typeof apiContract.financePlus;

const MAX_MONTHS = 120;

const CSV_HEADERS = {
  de: [
    'Buchungsdatum',
    'Wertstellung',
    'Konto',
    'Betrag',
    'Währung',
    'Empfänger/Auftraggeber',
    'IBAN',
    'Verwendungszweck',
    'Kategorie',
    'Tags',
    'Notizen',
  ],
  en: [
    'Booking date',
    'Value date',
    'Account',
    'Amount',
    'Currency',
    'Counterparty',
    'IBAN',
    'Purpose',
    'Category',
    'Tags',
    'Notes',
  ],
} as const;

function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

@Injectable()
export class FinanceReportsService {
  constructor(private readonly db: Db) {}

  private checkRange(from: string, to: string): void {
    if (from > to) throw badRequest('from must not be after to');
    if (monthsBetween(from.slice(0, 7), to.slice(0, 7)).length > MAX_MONTHS)
      throw badRequest(`At most ${MAX_MONTHS} months per report`, 'range_too_large');
  }

  private async rows(tx: Transaction, ctx: HouseholdContext, from: string, to: string) {
    const accounts = await tx
      .select({ id: finAccounts.id })
      .from(finAccounts)
      .where(visibleAccounts(ctx));
    if (accounts.length === 0) return [];
    const rows = await tx
      .select({
        bookingDate: finTransactions.bookingDate,
        amountMinor: finTransactions.amountMinor,
        categoryId: finTransactions.categoryId,
        transfer: finTransactions.transferAccountId,
      })
      .from(finTransactions)
      .where(
        and(
          inArray(
            finTransactions.accountId,
            accounts.map((a) => a.id),
          ),
          gte(finTransactions.bookingDate, from),
          lte(finTransactions.bookingDate, to),
        ),
      );
    return rows.map((r) => ({
      bookingDate: r.bookingDate,
      amountMinor: r.amountMinor,
      categoryId: r.categoryId,
      isTransfer: r.transfer !== null,
    }));
  }

  async netWorth(ctx: HouseholdContext, input: In<C['netWorth']>): Promise<Out<C['netWorth']>> {
    requireFeature(ctx, 'advanced_reports');
    const { from, to } = input.query;
    this.checkRange(from, to);
    const currency = householdCurrency(ctx);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      // Accounts in other currencies would need exchange rates; they are left out.
      const accounts = await tx
        .select({ id: finAccounts.id, openingBalanceMinor: finAccounts.openingBalanceMinor })
        .from(finAccounts)
        .where(and(visibleAccounts(ctx), eq(finAccounts.currency, currency)))
        .orderBy(finAccounts.createdAt);
      const txs = accounts.length
        ? await tx
            .select({
              accountId: finTransactions.accountId,
              bookingDate: finTransactions.bookingDate,
              amountMinor: finTransactions.amountMinor,
            })
            .from(finTransactions)
            .where(
              and(
                inArray(
                  finTransactions.accountId,
                  accounts.map((a) => a.id),
                ),
                lte(finTransactions.bookingDate, lastDayOf(to)),
              ),
            )
        : [];
      return { currency, points: netWorthHistory(accounts, txs, from, to) };
    });
  }

  async categoryTrends(
    ctx: HouseholdContext,
    input: In<C['categoryTrends']>,
  ): Promise<Out<C['categoryTrends']>> {
    requireFeature(ctx, 'advanced_reports');
    const { from, to } = input.query;
    this.checkRange(from, to);
    return this.db.tenant(actorOf(ctx), async (tx) =>
      categoryTrends(await this.rows(tx, ctx, `${from}-01`, lastDayOf(to)), from, to),
    );
  }

  async yearOverYear(
    ctx: HouseholdContext,
    input: In<C['yearOverYear']>,
  ): Promise<Out<C['yearOverYear']>> {
    requireFeature(ctx, 'advanced_reports');
    const { year } = input.query;
    return this.db.tenant(actorOf(ctx), async (tx) => ({
      year,
      ...yearOverYear(await this.rows(tx, ctx, `${year - 1}-01-01`, `${year}-12-31`), year),
    }));
  }

  async exportCsv(
    ctx: HouseholdContext,
    input: In<C['exportTransactions']>,
  ): Promise<Out<C['exportTransactions']>> {
    requireFeature(ctx, 'advanced_reports');
    const { from, to, accountId } = input.query;
    this.checkRange(from, to);
    const locale = ctx.locale === 'en' ? 'en' : 'de';
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const accounts = await tx
        .select({ id: finAccounts.id, name: finAccounts.name })
        .from(finAccounts)
        .where(and(visibleAccounts(ctx), accountId ? eq(finAccounts.id, accountId) : undefined));
      const rows = accounts.length
        ? await tx
            .select()
            .from(finTransactions)
            .where(
              and(
                inArray(
                  finTransactions.accountId,
                  accounts.map((a) => a.id),
                ),
                gte(finTransactions.bookingDate, from),
                lte(finTransactions.bookingDate, to),
              ),
            )
            .orderBy(asc(finTransactions.bookingDate), asc(finTransactions.id))
        : [];
      const cats = await tx.select().from(finCategories);
      const accountName = new Map(accounts.map((a) => [a.id, a.name]));
      const amount = (minor: number, currency: string) => {
        const s = minorToDecimalString(minor, currencyExponent(asCurrency(currency)));
        return locale === 'de' ? s.replace('.', ',') : s;
      };
      const content = toCsv(
        CSV_HEADERS[locale],
        rows.map((r) => {
          const cat = cats.find((c) => c.id === r.categoryId);
          return [
            r.bookingDate,
            r.valueDate,
            accountName.get(r.accountId) ?? '',
            amount(r.amountMinor, r.currency),
            r.currency,
            r.counterpartyName,
            r.counterpartyIban,
            r.purpose,
            cat ? categoryLabel(locale, cat) : null,
            r.tags.join(', '),
            r.notes,
          ];
        }),
        locale === 'de' ? ';' : ',',
      );
      return {
        fileName: `${locale === 'de' ? 'umsaetze' : 'transactions'}_${from}_${to}.csv`,
        content,
      };
    });
  }
}
