import { randomUUID } from 'expo-crypto';

/**
 * The contracts client creates an Idempotency-Key with `crypto.randomUUID()` for every POST.
 * Hermes does not ship WebCrypto, so back it with expo-crypto (browsers already have it).
 */
interface CryptoLike {
  randomUUID?: () => string;
}

const g = globalThis as { crypto?: CryptoLike };
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.randomUUID !== 'function') g.crypto.randomUUID = randomUUID;

/** RFC 4122 v4 id for optimistic placeholders and idempotency keys. */
export function newId(): string {
  return randomUUID();
}
