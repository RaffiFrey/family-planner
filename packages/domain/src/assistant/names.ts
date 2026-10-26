/** Something the assistant can refer to by name (member, calendar, list, account …). */
export interface NamedRef {
  id: string;
  name: string;
}

/** Lower-case, accent-free, single-spaced form used for name matching ("Müller " → "muller"). */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const SELF_WORDS = new Set(['ich', 'mich', 'mir', 'me', 'myself', 'i']);

/**
 * Resolves a free-text name to exactly one entry. Tries, in order: the full name, the first word
 * of the name ("Anna" → "Anna Frey") and a unique prefix ("Mi" → "Mia"). Ambiguous or unknown
 * names resolve to null — the caller must report them instead of guessing.
 */
export function resolveName<T extends NamedRef>(query: string, refs: readonly T[]): T | null {
  const q = normalizeName(query);
  if (q === '') return null;
  const normalized = refs.map((r) => ({ ref: r, name: normalizeName(r.name) }));
  const strategies: ((name: string) => boolean)[] = [
    (n) => n === q,
    (n) => n.split(' ')[0] === q,
    (n) => q.length >= 2 && n.startsWith(q),
  ];
  for (const matches of strategies) {
    const hits = normalized.filter((r) => matches(r.name));
    if (hits.length === 1) return (hits[0] as { ref: T }).ref;
    if (hits.length > 1) return null;
  }
  return null;
}

export interface MemberResolution {
  ids: string[];
  unknown: string[];
}

/** Resolves member names (and "ich"/"me" to `selfId`), keeping order and dropping duplicates. */
export function resolveMembers(
  names: readonly string[],
  members: readonly NamedRef[],
  selfId: string | null = null,
): MemberResolution {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const id =
      selfId && SELF_WORDS.has(normalizeName(name)) ? selfId : resolveName(name, members)?.id;
    if (!id) unknown.push(name);
    else if (!ids.includes(id)) ids.push(id);
  }
  return { ids, unknown };
}
