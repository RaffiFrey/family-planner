/** Accepts https:// and webcal:// feed URLs (the API fetches webcal as https). */
export function isFeedUrl(input: string): boolean {
  return /^(https?|webcal):\/\/[^\s/]+\.[^\s]+/i.test(input.trim());
}
