import { describe, expect, it } from "vitest";

import { isRegionCode, parseRegionFromAcceptLanguage } from "./region";

describe("parseRegionFromAcceptLanguage", () => {
  it("reads the country from the first tag that carries one", () => {
    expect(parseRegionFromAcceptLanguage("es-AR,es;q=0.9,en;q=0.8")).toBe("AR");
  });

  it("skips language-only tags rather than guessing a country for them", () => {
    expect(parseRegionFromAcceptLanguage("en,fr-CA;q=0.7")).toBe("CA");
    expect(parseRegionFromAcceptLanguage("en,fr,de")).toBeNull();
  });

  it("uppercases and ignores the wildcard tag", () => {
    expect(parseRegionFromAcceptLanguage("*,pt-br;q=0.5")).toBe("BR");
  });

  it("returns null for missing or malformed headers instead of throwing", () => {
    expect(parseRegionFromAcceptLanguage(null)).toBeNull();
    expect(parseRegionFromAcceptLanguage("")).toBeNull();
    expect(parseRegionFromAcceptLanguage("!!!,;;;,----")).toBeNull();
  });
});

describe("isRegionCode", () => {
  it("accepts only two uppercase letters", () => {
    expect(isRegionCode("AR")).toBe(true);
    expect(isRegionCode("ar")).toBe(false);
    expect(isRegionCode("ARG")).toBe(false);
    expect(isRegionCode(null)).toBe(false);
  });
});
