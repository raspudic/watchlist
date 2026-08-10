const LIST_PREFIX = /^(?:[-*+]\s*(?:\[[ xX]\]\s*)?|\d+[.)]\s*)/;
const NON_TITLE_LINE = /^(?:and|or|movies?|films?|shows?|series|tv(?:\s+shows?)?|anime)\s*:?$/i;

export const MAX_BULK_TITLES = 40;

export function parseBulkTitles(input: string) {
  const seen = new Set<string>();
  const titles: string[] = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("```") || NON_TITLE_LINE.test(trimmed)) continue;

    const title = trimmed.replace(LIST_PREFIX, "").trim();
    const key = title.toLocaleLowerCase();
    if (!title || NON_TITLE_LINE.test(title) || seen.has(key)) continue;

    seen.add(key);
    titles.push(title);
  }

  return titles;
}
