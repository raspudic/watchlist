import { describe, expect, it } from "vitest";

import { parseBulkTitles } from "./bulk-import";

describe("parseBulkTitles", () => {
  it("reads common Notes and Markdown list formats", () => {
    expect(parseBulkTitles(`
- Arrival
* Severance
1. Attack on Titan
2) Dark
- [ ] The Bear
    `)).toEqual(["Arrival", "Severance", "Attack on Titan", "Dark", "The Bear"]);
  });

  it("ignores separators, headings, code fences, blanks, and duplicates", () => {
    expect(parseBulkTitles(`
\`\`\`diff
Movies:
- Heat
- heat

and
Shows
- Shogun
\`\`\`
    `)).toEqual(["Heat", "Shogun"]);
  });

  it("leaves punctuation inside titles intact", () => {
    expect(parseBulkTitles("Spider-Man: Into the Spider-Verse\n9\nCatch-22")).toEqual([
      "Spider-Man: Into the Spider-Verse",
      "9",
      "Catch-22",
    ]);
  });
});
