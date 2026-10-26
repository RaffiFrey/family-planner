import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

export const staffEmail = process.env.E2E_STAFF_EMAIL;
export const staffPassword = process.env.E2E_STAFF_PASSWORD;
export const hasStaffCredentials = Boolean(staffEmail && staffPassword);

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 TOTP secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), so long suites never run with an expired code. */
function totpFromSecret(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

/**
 * A current authenticator code: generated from E2E_STAFF_TOTP_SECRET when set, otherwise the
 * pre-generated E2E_STAFF_TOTP (valid only for a short window).
 */
export function currentTotp(): string | undefined {
  const secret = process.env.E2E_STAFF_TOTP_SECRET;
  if (secret) return totpFromSecret(secret);
  return process.env.E2E_STAFF_TOTP;
}

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(staffEmail ?? '');
  await page.getByLabel('Password').fill(staffPassword ?? '');
  const totp = currentTotp();
  if (totp) {
    await page.getByRole('button', { name: 'I have an authenticator code' }).click();
    await page.getByLabel('Authenticator code').fill(totp);
  }
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}
