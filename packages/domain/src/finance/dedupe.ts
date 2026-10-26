import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { ParsedTransaction } from './types.js';

function norm(s: string | null): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Stable fingerprint of an imported transaction. Identical transactions in the same file
 * (two coffees, same day, same amount) are told apart by their occurrence index, so
 * re-importing an overlapping export never creates duplicates and never drops real ones.
 */
export function importHash(accountId: string, tx: ParsedTransaction, occurrence: number): string {
  const key = [
    accountId,
    tx.bookingDate,
    tx.amountMinor,
    tx.currency,
    norm(tx.counterpartyIban),
    norm(tx.counterpartyName),
    norm(tx.purpose),
    occurrence,
  ].join('|');
  return bytesToHex(sha256(utf8ToBytes(key)));
}

/** Assigns hashes to a batch, numbering identical transactions within the batch. */
export function hashBatch(
  accountId: string,
  txs: readonly ParsedTransaction[],
): { tx: ParsedTransaction; hash: string }[] {
  const counts = new Map<string, number>();
  return txs.map((tx) => {
    const base = importHash(accountId, tx, 0);
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    return { tx, hash: n === 0 ? base : importHash(accountId, tx, n) };
  });
}
