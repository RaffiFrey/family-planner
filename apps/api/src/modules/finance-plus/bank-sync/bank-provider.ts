import type { ParsedTransaction } from '@fp/domain/finance';

export const BANK_SYNC_PROVIDER = Symbol('BANK_SYNC_PROVIDER');

export type ProviderId = 'mock' | 'finapi';
export type ProviderAccountType =
  'checking' | 'savings' | 'cash' | 'credit_card' | 'depot' | 'loan' | 'other';

export interface ProviderBank {
  id: string;
  name: string;
  bic: string | null;
  city: string | null;
  logoUrl: string | null;
}

/** What we store per connection (decrypted for the duration of a call). */
export interface ProviderSession {
  bankId: string;
  /** Provider's connection id; null while the bank login is still pending. */
  externalId: string | null;
  /** Provider-side user (e.g. finAPI user id) and its secret. */
  externalUser: string | null;
  secret: string | null;
  /** Provider-specific id of the pending web form / consent flow. */
  pendingRef: string | null;
}

export interface StartedConnection {
  /** Where the user logs in at the bank (strong customer authentication). */
  redirectUrl: string;
  externalUser: string | null;
  secret: string | null;
  pendingRef: string | null;
}

export interface CompletedConnection {
  externalId: string;
  consentExpiresAt: Date | null;
}

export interface ProviderAccount {
  externalId: string;
  name: string;
  iban: string | null;
  currency: string;
  type: ProviderAccountType;
}

/**
 * PSD2 account information via a licensed aggregator (the aggregator holds the AISP licence).
 * Implementations: MockBankProvider (dev/tests), FinApiBankProvider.
 */
export interface BankSyncProvider {
  readonly id: ProviderId;
  listBanks(query: string): Promise<ProviderBank[]>;
  /**
   * Starts the bank login. `householdRef` is a pseudonymous stable id of the household,
   * `callbackUrl` is where the provider sends the user back to; `existing` reuses a
   * provider-side user created for an earlier connection of the same household.
   */
  createConnection(
    householdRef: string,
    bankId: string,
    callbackUrl: string,
    existing?: { externalUser: string; secret: string | null },
  ): Promise<StartedConnection>;
  /** Called after the redirect back; resolves the provider's connection id. */
  completeConnection(session: ProviderSession): Promise<CompletedConnection>;
  getAccounts(session: ProviderSession): Promise<ProviderAccount[]>;
  /** Booked and pending transactions since `since` (YYYY-MM-DD). */
  getTransactions(
    session: ProviderSession,
    accountExternalId: string,
    since: string,
  ): Promise<ParsedTransaction[]>;
  deleteConnection(session: ProviderSession): Promise<void>;
}

export class BankProviderError extends Error {
  override name = 'BankProviderError';
}
