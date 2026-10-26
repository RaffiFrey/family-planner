import { randomBytes } from 'node:crypto';
import type { ParsedTransaction } from '@fp/domain/finance';
import { currencyExponent, isCurrencyCode } from '@fp/domain/money';
import {
  type BankSyncProvider,
  BankProviderError,
  type CompletedConnection,
  type ProviderAccount,
  type ProviderAccountType,
  type ProviderBank,
  type ProviderSession,
  type StartedConnection,
} from './bank-provider.js';

export interface FinApiConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

interface Token {
  value: string;
  expiresAt: number;
}

interface FinApiAccount {
  id: number;
  accountName: string | null;
  iban: string | null;
  accountCurrency: string | null;
  accountType: string | null;
}

interface FinApiTransaction {
  id: number;
  amount: number;
  bankBookingDate: string;
  valueDate: string | null;
  purpose: string | null;
  counterpartName: string | null;
  counterpartIban: string | null;
  type: string | null;
}

const ACCOUNT_TYPES: Record<string, ProviderAccountType> = {
  Checking: 'checking',
  Savings: 'savings',
  CreditCard: 'credit_card',
  Security: 'depot',
  Loan: 'loan',
  Bausparen: 'savings',
};

/**
 * finAPI Access v2 + Web Form 2.0 (https://docs.finapi.io). One finAPI user per household
 * (credentials stored encrypted on the connection), bank login and SCA happen in finAPI's
 * hosted web form; finAPI's automatic batch update keeps the data fresh and our sync job
 * only reads accounts and transactions.
 */
export class FinApiBankProvider implements BankSyncProvider {
  readonly id = 'finapi' as const;
  private clientToken: Token | null = null;
  private readonly webFormUrl: string;

  constructor(
    private readonly config: FinApiConfig,
    private readonly http: typeof fetch = fetch,
  ) {
    const base = new URL(config.baseUrl);
    // sandbox.finapi.io → webform-sandbox.finapi.io, live.finapi.io → webform-live.finapi.io
    this.webFormUrl = /^(sandbox|live)\.finapi\.io$/.test(base.host)
      ? `${base.protocol}//webform-${base.host}`
      : base.origin;
  }

  // ------------------------------------------------------------ HTTP

  private async call<T>(
    url: string,
    init: { method?: string; token?: string; json?: unknown; form?: Record<string, string> },
  ): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    let body: string | undefined;
    if (init.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(init.json);
    } else if (init.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(init.form).toString();
    }
    const res = await this.http(url, {
      method: init.method ?? (body ? 'POST' : 'GET'),
      headers,
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = `finAPI ${res.status}`;
      try {
        const err = JSON.parse(text) as { errors?: { message?: string }[] };
        if (err.errors?.[0]?.message) message += `: ${err.errors[0].message}`;
      } catch {
        // Not JSON; keep the status only.
      }
      throw new BankProviderError(message);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private api<T>(path: string, init: Parameters<FinApiBankProvider['call']>[1] = {}) {
    return this.call<T>(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, init);
  }

  private async token(form: Record<string, string>): Promise<Token> {
    const t = await this.api<{ access_token: string; expires_in: number }>('/api/v2/oauth/token', {
      form: { client_id: this.config.clientId, client_secret: this.config.clientSecret, ...form },
    });
    return { value: t.access_token, expiresAt: Date.now() + (t.expires_in - 60) * 1000 };
  }

  private async client(): Promise<string> {
    if (!this.clientToken || this.clientToken.expiresAt < Date.now())
      this.clientToken = await this.token({ grant_type: 'client_credentials' });
    return this.clientToken.value;
  }

  private async user(session: { externalUser: string | null; secret: string | null }) {
    if (!session.externalUser || !session.secret)
      throw new BankProviderError('Missing finAPI user');
    return (
      await this.token({
        grant_type: 'password',
        username: session.externalUser,
        password: session.secret,
      })
    ).value;
  }

  // ------------------------------------------------------------ provider

  async listBanks(query: string): Promise<ProviderBank[]> {
    const params = new URLSearchParams({ perPage: '20', ...(query ? { search: query } : {}) });
    const res = await this.api<{
      banks: {
        id: number;
        name: string;
        bic: string | null;
        city: string | null;
        logo?: { url?: string } | null;
      }[];
    }>(`/api/v2/banks?${params.toString()}`, { token: await this.client() });
    return res.banks.map((b) => ({
      id: String(b.id),
      name: b.name,
      bic: b.bic ?? null,
      city: b.city ?? null,
      logoUrl: b.logo?.url ?? null,
    }));
  }

  async createConnection(
    _householdRef: string,
    bankId: string,
    callbackUrl: string,
    existing?: { externalUser: string; secret: string | null },
  ): Promise<StartedConnection> {
    let user = existing?.secret ? { id: existing.externalUser, password: existing.secret } : null;
    if (!user) {
      // finAPI generates the user id; we choose a strong password and keep it encrypted.
      user = await this.api<{ id: string; password: string }>('/api/v2/users', {
        token: await this.client(),
        json: { password: randomBytes(24).toString('base64url'), isAutoUpdateEnabled: true },
      });
    }
    const form = await this.call<{ id: string; url: string }>(
      `${this.webFormUrl}/api/webForms/bankConnectionImport`,
      {
        token: await this.user({ externalUser: user.id, secret: user.password }),
        json: { bank: { id: Number(bankId) }, redirectUrl: callbackUrl },
      },
    );
    return {
      redirectUrl: form.url,
      externalUser: user.id,
      secret: user.password,
      pendingRef: form.id,
    };
  }

  async completeConnection(session: ProviderSession): Promise<CompletedConnection> {
    if (!session.pendingRef) throw new BankProviderError('No pending web form');
    const token = await this.user(session);
    const form = await this.call<{ status: string; payload?: { bankConnectionId?: number } }>(
      `${this.webFormUrl}/api/webForms/${encodeURIComponent(session.pendingRef)}`,
      { token },
    );
    const connectionId = form.payload?.bankConnectionId;
    if (form.status !== 'COMPLETED' || !connectionId)
      throw new BankProviderError(`Bank login not completed (${form.status})`);
    const conn = await this.api<{
      interfaces?: { aisConsent?: { expiresAt?: string | null } | null }[];
    }>(`/api/v2/bankConnections/${connectionId}`, { token });
    const expires = conn.interfaces?.find((i) => i.aisConsent?.expiresAt)?.aisConsent?.expiresAt;
    return {
      externalId: String(connectionId),
      consentExpiresAt: expires ? new Date(expires) : null,
    };
  }

  async getAccounts(session: ProviderSession): Promise<ProviderAccount[]> {
    if (!session.externalId) throw new BankProviderError('Connection is not active');
    const res = await this.api<{ accounts: FinApiAccount[] }>(
      `/api/v2/accounts?bankConnectionIds=${encodeURIComponent(session.externalId)}`,
      { token: await this.user(session) },
    );
    return res.accounts.map((a) => ({
      externalId: String(a.id),
      name: a.accountName ?? a.iban ?? `Account ${a.id}`,
      iban: a.iban,
      currency: a.accountCurrency ?? 'EUR',
      type: ACCOUNT_TYPES[a.accountType ?? ''] ?? 'other',
    }));
  }

  async getTransactions(
    session: ProviderSession,
    accountExternalId: string,
    since: string,
  ): Promise<ParsedTransaction[]> {
    const token = await this.user(session);
    const account = await this.api<FinApiAccount>(
      `/api/v2/accounts/${encodeURIComponent(accountExternalId)}`,
      { token },
    );
    const currency =
      account.accountCurrency && isCurrencyCode(account.accountCurrency)
        ? account.accountCurrency
        : 'EUR';
    const factor = 10 ** currencyExponent(currency);
    const out: ParsedTransaction[] = [];
    for (let page = 1, pages = 1; page <= pages && page <= 50; page++) {
      const params = new URLSearchParams({
        view: 'bankView',
        accountIds: accountExternalId,
        minBankBookingDate: since,
        perPage: '500',
        page: String(page),
        order: 'bankBookingDate,asc',
      });
      const res = await this.api<{
        transactions: FinApiTransaction[];
        paging: { pageCount: number };
      }>(`/api/v2/transactions?${params.toString()}`, { token });
      pages = res.paging.pageCount;
      for (const t of res.transactions) {
        out.push({
          bookingDate: t.bankBookingDate,
          valueDate: t.valueDate,
          amountMinor: Math.round(t.amount * factor),
          currency,
          counterpartyName: t.counterpartName,
          counterpartyIban: t.counterpartIban,
          purpose: t.purpose ?? '',
          bookingText: t.type,
          status: 'booked',
          bankReference: String(t.id),
        });
      }
    }
    return out;
  }

  async deleteConnection(session: ProviderSession): Promise<void> {
    if (!session.externalId) return;
    await this.api(`/api/v2/bankConnections/${encodeURIComponent(session.externalId)}`, {
      method: 'DELETE',
      token: await this.user(session),
    });
  }
}
