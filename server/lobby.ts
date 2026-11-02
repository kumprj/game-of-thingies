/** Distinct author names (first spelling wins), sorted case-insensitively. Names only, for the pre-start lobby line (#42). */
export function answeredNames(entries: {authorName?: string}[]): string[] {
  const byLower = new Map<string, string>();
  for (const e of entries) {
    const key = e.authorName?.toLowerCase();
    if (e.authorName && key && !byLower.has(key)) byLower.set(key, e.authorName);
  }
  return [...byLower.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, name]) => name);
}
