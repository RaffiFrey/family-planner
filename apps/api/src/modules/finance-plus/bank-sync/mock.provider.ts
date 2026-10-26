import { createHash, randomBytes } from 'node:crypto';
import type { ParsedTransaction } from '@fp/domain/finance';
import { formatLocalDate } from '@fp/domain/time';
import {
  type BankSyncProvider,
  BankProviderError,
  type CompletedConnection,
  type ProviderAccount,
  type ProviderBank,
  type ProviderSession,
  type StartedConnection,
} from './bank-provider.js';

const BANKS: ProviderBank[] = [
  {
    id: 'mock-sparkasse',
    name: 'Sparkasse Musterstadt (Demo)',
    bic: 'MOCKDEM1SPK',
    city: 'Musterstadt',
    logoUrl: null,
  },
  { id: 'mock-direktbank', name: 'Demo Direktbank', bic: 'MOCKDEM1DIR', city: null, logoUrl: null },
  /** Logs in fine, but every sync fails (for testing error handling). */
  { id: 'mock-fail', name: 'Störungsbank (Demo)', bic: 'MOCKDEM1ERR', city: null, logoUrl: null },
];

interface Template {
  day: number;
  amountMinor: number;
  name: string;
  iban: string | null;
  purpose: string;
}

const GIRO: Template[] = [
  {
    day: 1,
    amountMinor: 325000,
    name: 'Muster AG',
    iban: 'DE02120300000000202051',
    purpose: 'Gehalt',
  },
  {
    day: 3,
    amountMinor: -110000,
    name: 'Hausverwaltung Schmidt',
    iban: 'DE02500105170137075030',
    purpose: 'Miete',
  },
  { day: 5, amountMinor: -8500, name: 'Stadtwerke Musterstadt', iban: null, purpose: 'Strom' },
  { day: 10, amountMinor: -4567, name: 'REWE Markt GmbH', iban: null, purpose: 'REWE SAGT DANKE' },
  { day: 15, amountMinor: -1399, name: 'NETFLIX.COM', iban: null, purpose: 'Netflix Abo' },
  { day: 20, amountMinor: -2345, name: 'REWE Markt GmbH', iban: null, purpose: 'REWE SAGT DANKE' },
];
const SAVINGS: Template[] = [
  { day: 2, amountMinor: 20000, name: 'Sparplan', iban: null, purpose: 'Dauerauftrag Sparen' },
];

/** ISO 13616 check digits for a German BBAN. */
function germanIban(bban: string): string {
  const numeric = `${bban}131400`; // "DE00" moved to the end, D=13, E=14
  const check = 98n - (BigInt(numeric) % 97n);
  return `DE${String(check).padStart(2, '0')}${bban}`;
}

function digits(seed: string, n: number): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  return BigInt(`0x${hex}`).toString().slice(0, n).padStart(n, '0');
}

/** Runs `fn` as a promise (synchronous throws become rejections). */
const later = <T>(fn: () => T): Promise<T> =>
  new Promise((resolve) => {
    resolve(fn());
  });

/**
 * Deterministic fake aggregator for development and tests: the web form "completes"
 * immediately (the redirect URL is our own callback) and every account produces the same
 * monthly bookings, so re-syncing never yields new rows.
 */
export class MockBankProvider implements BankSyncProvider {
  readonly id = 'mock' as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  listBanks(query: string): Promise<ProviderBank[]> {
    const q = query.trim().toLowerCase();
    return Promise.resolve(
      BANKS.filter((b) => !q || b.name.toLowerCase().includes(q) || b.id.includes(q)),
    );
  }

  createConnection(
    householdRef: string,
    bankId: string,
    callbackUrl: string,
  ): Promise<StartedConnection> {
    return later(() => {
      if (!BANKS.some((b) => b.id === bankId)) throw new BankProviderError('Unknown bank');
      return {
        redirectUrl: callbackUrl,
        externalUser: `mock-user-${householdRef.slice(0, 12)}`,
        secret: null,
        pendingRef: `mock-${bankId}-${randomBytes(6).toString('hex')}`,
      };
    });
  }

  completeConnection(session: ProviderSession): Promise<CompletedConnection> {
    return later(() => {
      if (!session.pendingRef) throw new BankProviderError('No pending bank login');
      return {
        externalId: session.pendingRef,
        // PSD2 consents for account information last up to 180 days.
        consentExpiresAt: new Date(this.now().getTime() + 180 * 86_400_000),
      };
    });
  }

  getAccounts(session: ProviderSession): Promise<ProviderAccount[]> {
    return later(() => {
      const ext = this.connectionId(session);
      const blz = digits(`${ext}blz`, 8);
      return [
        {
          externalId: `${ext}:giro`,
          name: 'Girokonto',
          iban: germanIban(`${blz}${digits(`${ext}giro`, 10)}`),
          currency: 'EUR',
          type: 'checking' as const,
        },
        {
          externalId: `${ext}:tagesgeld`,
          name: 'Tagesgeld',
          iban: germanIban(`${blz}${digits(`${ext}tg`, 10)}`),
          currency: 'EUR',
          type: 'savings' as const,
        },
      ];
    });
  }

  getTransactions(
    session: ProviderSession,
    accountExternalId: string,
    since: string,
  ): Promise<ParsedTransaction[]> {
    return later(() => {
      this.connectionId(session);
      if (session.bankId === 'mock-fail')
        throw new BankProviderError('The bank is temporarily unavailable');
      const templates = accountExternalId.endsWith(':giro')
        ? GIRO
        : accountExternalId.endsWith(':tagesgeld')
          ? SAVINGS
          : [];
      const now = this.now();
      const today = formatLocalDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
      const out: ParsedTransaction[] = [];
      for (let back = 3; back >= 0; back--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
        for (const t of templates) {
          const date = formatLocalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, t.day);
          if (date < since || date > today) continue;
          out.push({
            bookingDate: date,
            valueDate: date,
            amountMinor: t.amountMinor,
            currency: 'EUR',
            counterpartyName: t.name,
            counterpartyIban: t.iban,
            purpose: t.purpose,
            bookingText: t.amountMinor > 0 ? 'Gutschrift' : 'Lastschrift',
            status: 'booked',
            bankReference: `${date}-${t.day}-${Math.abs(t.amountMinor)}`,
          });
        }
      }
      return out;
    });
  }

  deleteConnection(): Promise<void> {
    // Nothing to revoke at a fake aggregator.
    return Promise.resolve();
  }

  private connectionId(session: ProviderSession): string {
    if (!session.externalId) throw new BankProviderError('Connection is not active');
    return session.externalId;
  }
}
