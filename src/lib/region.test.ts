import { describe, expect, it } from "vitest";

import { isRegionCode, normalizeRegionCodes, parseRegionFromAcceptLanguage, regionFlag } from "./region";

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

describe("normalizeRegionCodes", () => {
  it("keeps the order it was given, because the first country is home", () => {
    expect(normalizeRegionCodes(["se", "AR"])).toEqual(["SE", "AR"]);
  });

  it("drops a repeated country without failing the whole list", () => {
    expect(normalizeRegionCodes(["SE", "se", "AR"])).toEqual(["SE", "AR"]);
  });

  it("accepts an empty list, which is how the last country is removed", () => {
    expect(normalizeRegionCodes([])).toEqual([]);
  });

  /* Rejecting outright beats saving a shorter list than was asked for. */
  it("refuses anything malformed rather than filtering it out", () => {
    expect(normalizeRegionCodes(["SE", "Sweden"])).toBeNull();
    expect(normalizeRegionCodes(["SE", 12])).toBeNull();
    expect(normalizeRegionCodes("SE")).toBeNull();
  });

  it("refuses more countries than an account may hold", () => {
    expect(normalizeRegionCodes(["SE", "AR", "US"])).toEqual(["SE", "AR", "US"]);
    expect(normalizeRegionCodes(["SE", "AR", "US", "GB"])).toBeNull();
  });
});

describe("regionFlag", () => {
  it("maps a country code onto its regional indicator letters", () => {
    expect(regionFlag("SE")).toBe("\u{1F1F8}\u{1F1EA}");
    expect(regionFlag("US")).toBe("\u{1F1FA}\u{1F1F8}");
  });

  it("has nothing to draw for something that is not a country code", () => {
    expect(regionFlag("se")).toBe("");
    expect(regionFlag("SWE")).toBe("");
  });
});
