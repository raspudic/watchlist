import { describe, expect, it } from "vitest";

import { parseLibraryViewStyle } from "@/hooks/use-library-view-style";

describe("parseLibraryViewStyle", () => {
  it("keeps grid and defaults every other value to list", () => {
    expect(parseLibraryViewStyle("grid")).toBe("grid");
    expect(parseLibraryViewStyle("list")).toBe("list");
    expect(parseLibraryViewStyle(null)).toBe("list");
  });
});
