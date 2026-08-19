const REGION_CODE = /^[A-Z]{2}$/;

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
