import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

/** Sends push notifications through the Expo Push Service (FCM/APNs underneath). */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Returns tokens that are no longer valid so callers can remove them. */
  async send(messages: PushMessage[]): Promise<string[]> {
    const expo = messages.filter(
      (m) => m.to.startsWith('ExponentPushToken[') || m.to.startsWith('ExpoPushToken['),
    );
    if (expo.length === 0) return [];
    const invalid: string[] = [];
    for (let i = 0; i < expo.length; i += 100) {
      const chunk = expo.slice(i, i + 100);
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(this.env.EXPO_ACCESS_TOKEN
              ? { authorization: `Bearer ${this.env.EXPO_ACCESS_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(chunk.map((m) => ({ ...m, sound: 'default' }))),
        });
        const json = (await res.json()) as { data?: ExpoTicket[] };
        json.data?.forEach((ticket, idx) => {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            invalid.push((chunk[idx] as PushMessage).to);
          }
        });
      } catch (e) {
        this.logger.warn(`Push send failed: ${(e as Error).message}`);
      }
    }
    return invalid;
  }
}
