import { expo } from '@better-auth/expo';
import { passkey } from '@better-auth/passkey';
import {
  account,
  type Database,
  passkey as passkeyTable,
  session,
  twoFactor as twoFactorTable,
  user,
  verification,
} from '@fp/db';
import { translate } from '@fp/i18n';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, twoFactor } from 'better-auth/plugins';
import type { Env } from '../../config/env.js';
import { type MailerService, mailLayout } from '../../infra/mailer.service.js';

export function createAuth(env: Env, db: Database, mailer: MailerService) {
  const webUrl = new URL(env.WEB_URL);
  const socialProviders = {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
      ? { apple: { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET } }
      : {}),
  };

  return betterAuth({
    appName: 'Family Planer',
    baseURL: env.API_PUBLIC_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_URL, ...env.CORS_ORIGINS, 'familyplaner://', 'exp://'],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user,
        session,
        account,
        verification,
        passkey: passkeyTable,
        twoFactor: twoFactorTable,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      sendResetPassword: async ({ user: u, url }) => {
        await mailer.send({
          to: u.email,
          subject: 'Passwort zurücksetzen / Reset your password',
          text: `Hallo ${u.name},\n\nhier kannst du dein Passwort zurücksetzen:\n${url}`,
          html: mailLayout(
            'Passwort zurücksetzen',
            `Hallo ${u.name}, hier kannst du dein Passwort zurücksetzen.`,
            {
              label: 'Passwort zurücksetzen',
              url,
            },
          ),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: env.NODE_ENV === 'production',
      sendVerificationEmail: async ({ user: u, url }) => {
        await mailer.send({
          to: u.email,
          subject: `${translate('de', 'common.appName')}: E-Mail bestätigen`,
          text: `Hallo ${u.name},\n\nbitte bestätige deine E-Mail-Adresse:\n${url}`,
          html: mailLayout(
            'E-Mail bestätigen',
            `Hallo ${u.name}, bitte bestätige deine E-Mail-Adresse.`,
            {
              label: 'Bestätigen',
              url,
            },
          ),
        });
      },
    },
    socialProviders,
    user: {
      additionalFields: {
        locale: { type: 'string', defaultValue: 'de', required: false, input: true },
        banned: { type: 'boolean', defaultValue: false, required: false, input: false },
        deletionScheduledAt: { type: 'date', required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: env.NODE_ENV !== 'test', window: 60, max: 30 },
    advanced: {
      // Session cookie is shared by web.<domain> and api.<domain> in production.
      ...(webUrl.hostname !== 'localhost' && webUrl.hostname.includes('.')
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: webUrl.hostname.split('.').slice(-2).join('.'),
            },
          }
        : {}),
    },
    plugins: [
      passkey({ rpID: webUrl.hostname, rpName: 'Family Planer', origin: env.WEB_URL }),
      twoFactor({ issuer: 'Family Planer' }),
      expo(),
      bearer(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export const AUTH = Symbol('AUTH');
