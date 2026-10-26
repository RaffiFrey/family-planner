import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env.js';

/** The subset of a Google Calendar v3 event resource the sync uses. */
export interface GoogleEventTime {
  date?: string | null;
  dateTime?: string | null;
  timeZone?: string | null;
}

export interface GoogleEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  etag?: string;
  /** RFC 3339 last modification time. */
  updated?: string;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  /** RRULE/EXDATE lines of a recurring master. */
  recurrence?: string[] | null;
  /** Set on instances (exceptions) of a recurring event. */
  recurringEventId?: string | null;
  originalStartTime?: GoogleEventTime;
}

export interface GoogleEventInput {
  summary: string;
  description: string | null;
  location: string | null;
  start: GoogleEventTime;
  end: GoogleEventTime;
  recurrence: string[] | null;
  /** Lets Google link the event back to us. */
  extendedProperties?: { private: Record<string, string> };
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}

export interface GoogleEventPage {
  items: GoogleEvent[];
  nextPageToken?: string | null;
  nextSyncToken?: string | null;
}

/** The sync token is no longer valid (HTTP 410); a full sync is required. */
export class GoogleSyncTokenExpired extends Error {
  override name = 'GoogleSyncTokenExpired';
}

export class GoogleApiError extends Error {
  override name = 'GoogleApiError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Google OAuth + Calendar v3 calls used by the sync. Isolated behind an interface so the sync
 * logic is testable with a fake (real calls need OAuth credentials).
 */
export interface GoogleCalendarApi {
  authUrl(p: { redirectUri: string; state: string }): string;
  exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens>;
  refreshAccessToken(refreshToken: string): Promise<GoogleTokens>;
  revoke(token: string): Promise<void>;
  listEvents(
    accessToken: string,
    calendarId: string,
    p: { syncToken?: string | null; pageToken?: string | null; timeMin?: string },
  ): Promise<GoogleEventPage>;
  insertEvent(
    accessToken: string,
    calendarId: string,
    body: GoogleEventInput,
  ): Promise<GoogleEvent>;
  updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    body: GoogleEventInput,
  ): Promise<GoogleEvent>;
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
  /** Modifies one occurrence of a recurring event (creates the instance exception). */
  updateInstance(
    accessToken: string,
    calendarId: string,
    recurringEventId: string,
    originalStart: GoogleEventTime,
    body: GoogleEventInput,
  ): Promise<GoogleEvent>;
}

export const GOOGLE_CALENDAR_API = Symbol('GOOGLE_CALENDAR_API');
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar';

const OAUTH = 'https://oauth2.googleapis.com';
const API = 'https://www.googleapis.com/calendar/v3';

/** Plain `fetch` implementation against the Google REST endpoints. */
@Injectable()
export class FetchGoogleCalendarApi implements GoogleCalendarApi {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private get clientId(): string {
    if (!this.env.GOOGLE_CALENDAR_CLIENT_ID)
      throw new GoogleApiError(503, 'Google sync is not configured');
    return this.env.GOOGLE_CALENDAR_CLIENT_ID;
  }

  authUrl(p: { redirectUri: string; state: string }): string {
    const q = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: p.redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: p.state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
  }

  private async token(params: Record<string, string>): Promise<GoogleTokens> {
    const res = await fetch(`${OAUTH}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
        ...params,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!res.ok || !body.access_token)
      throw new GoogleApiError(res.status, `Token request failed: ${body.error ?? res.status}`);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresIn: body.expires_in ?? 3600,
    };
  }

  exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens> {
    return this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  }

  refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async revoke(token: string): Promise<void> {
    await fetch(`${OAUTH}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
  }

  private async call<T>(
    accessToken: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 410) throw new GoogleSyncTokenExpired('Sync token expired');
    if (res.status === 204 || (method === 'DELETE' && res.ok)) return undefined as T;
    if (!res.ok) throw new GoogleApiError(res.status, `Google Calendar API ${res.status}`);
    return (await res.json()) as T;
  }

  listEvents(
    accessToken: string,
    calendarId: string,
    p: { syncToken?: string | null; pageToken?: string | null; timeMin?: string },
  ): Promise<GoogleEventPage> {
    const q = new URLSearchParams({ maxResults: '250', showDeleted: 'true' });
    if (p.syncToken) q.set('syncToken', p.syncToken);
    else if (p.timeMin) q.set('timeMin', p.timeMin);
    if (p.pageToken) q.set('pageToken', p.pageToken);
    return this.call(
      accessToken,
      'GET',
      `/calendars/${encodeURIComponent(calendarId)}/events?${q.toString()}`,
    );
  }

  insertEvent(
    accessToken: string,
    calendarId: string,
    body: GoogleEventInput,
  ): Promise<GoogleEvent> {
    return this.call(
      accessToken,
      'POST',
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      body,
    );
  }

  updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    body: GoogleEventInput,
  ): Promise<GoogleEvent> {
    return this.call(
      accessToken,
      'PUT',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      body,
    );
  }

  async updateInstance(
    accessToken: string,
    calendarId: string,
    recurringEventId: string,
    originalStart: GoogleEventTime,
    body: GoogleEventInput,
  ): Promise<GoogleEvent> {
    const cal = encodeURIComponent(calendarId);
    const at = originalStart.dateTime ?? `${originalStart.date ?? ''}T00:00:00Z`;
    const q = new URLSearchParams({ originalStart: at, showDeleted: 'true', maxResults: '1' });
    const page = await this.call<GoogleEventPage>(
      accessToken,
      'GET',
      `/calendars/${cal}/events/${encodeURIComponent(recurringEventId)}/instances?${q.toString()}`,
    );
    const instance = page.items[0];
    if (!instance) throw new GoogleApiError(404, 'Occurrence not found on Google');
    const { recurrence: _r, ...rest } = body;
    return this.call(
      accessToken,
      'PUT',
      `/calendars/${cal}/events/${encodeURIComponent(instance.id)}`,
      {
        ...rest,
        status: 'confirmed',
      },
    );
  }

  async deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
    try {
      await this.call(
        accessToken,
        'DELETE',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      );
    } catch (e) {
      // Already gone on Google's side.
      if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return;
      if (e instanceof GoogleSyncTokenExpired) return;
      throw e;
    }
  }
}
