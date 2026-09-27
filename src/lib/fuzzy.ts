/**
 * Small deterministic fuzzy matcher for the command palette.
 * Returns 0..1: 1 = exact, ~0.85 = prefix/contains, lower = subsequence/token overlap.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.startsWith(q)) return 0.92;
  if (t.includes(q)) return 0.85;

  // Word-start match: "vs code" → "visual studio code"
  const words = t.split(/[\s\-_]+/);
  const initials = words.map((w) => w[0] ?? "").join("");
  if (initials.startsWith(q)) return 0.8;
  // Every query token must start a word or be a prefix of the initials
  // ("vs code" → "vs" matches initials "vsc", "code" starts a word).
  const qTokens = q.split(/\s+/);
  if (qTokens.every((qt) => words.some((w) => w.startsWith(qt)) || initials.startsWith(qt))) return 0.78;

  // Ordered subsequence match with gap penalty.
  let ti = 0;
  let matched = 0;
  let gaps = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    let found = false;
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = true;
        ti++;
        break;
      }
      gaps++;
      ti++;
    }
    if (!found) return 0;
    matched++;
  }
  const density = matched / (matched + gaps * 0.35);
  const coverage = matched / t.replace(/\s/g, "").length;
  const score = 0.35 + density * 0.3 + coverage * 0.1;
  return Math.min(0.72, score);
}
