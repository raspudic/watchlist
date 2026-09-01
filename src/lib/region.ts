const REGION_CODE = /^[A-Z]{2}$/;

/** Enough to cover a home country and the places you actually watch from. */
export const MAX_ACCOUNT_REGIONS = 3;

export function isRegionCode(value: string | null | undefined): value is string {
  return typeof value === "string" && REGION_CODE.test(value);
}

/**
 * Reads the country out of the browser's language preference (es-AR -> AR).
 *
 * Deliberately returns null rather than falling back to a popular country: a
 * wrong region silently shows someone another country's catalogue, which is
 * worse than asking. The header is attacker-controlled, so every tag is parsed
 * defensively and a malformed one is skipped rather than aborting the walk.
 */
export function parseRegionFromAcceptLanguage(header: string | null | undefined): string | null {
  if (!header) return null;

  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim();
    if (!tag || tag === "*") continue;

    try {
      const region = new Intl.Locale(tag).region?.toUpperCase();
      if (isRegionCode(region)) return region;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Normalizes a saved list of countries, in the order given: the first is home.
 * Returns null rather than dropping bad entries, so a malformed request is
 * rejected instead of silently saving something the reader did not ask for.
 */
export function normalizeRegionCodes(values: unknown): string[] | null {
  if (!Array.isArray(values)) return null;

  const codes: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") return null;
    const code = value.trim().toUpperCase();
    if (!isRegionCode(code)) return null;
    if (!codes.includes(code)) codes.push(code);
  }

  return codes.length > MAX_ACCOUNT_REGIONS ? null : codes;
}

/**
 * The two regional indicator letters for a country code. Platforms with flag
 * glyphs draw a flag; the rest draw the letters, which is why the code is
 * always shown beside it rather than replaced by it.
 */
export function regionFlag(code: string) {
  if (!isRegionCode(code)) return "";
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}
