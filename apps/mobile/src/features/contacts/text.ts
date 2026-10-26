/** "Nüsse, Penicillin; Bienen" → ["Nüsse", "Penicillin", "Bienen"] (trimmed, unique, max 30). */
export function splitList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,;\n]/)) {
    const v = part.trim().slice(0, 100);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out.slice(0, 30);
}
