export const ASSISTANT_KINDS = ['capture', 'receipt', 'insights', 'meals'] as const;
export type AssistantKind = (typeof ASSISTANT_KINDS)[number];

/** Assistant calls per household and local day (each call costs real money). */
export const ASSISTANT_DAILY_LIMIT = 100;
/** Prompt contents (proposal input text) are deleted after this many days. */
export const PROMPT_RETENTION_DAYS = 30;
/** Request metadata (tokens, latency — no content) is kept for cost reporting. */
export const REQUEST_LOG_RETENTION_DAYS = 400;
export const MAX_CAPTURE_CHARS = 1000;

export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export function remainingQuota(usedToday: number, limit = ASSISTANT_DAILY_LIMIT): number {
  return Math.max(0, limit - usedToday);
}
