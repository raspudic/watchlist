import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    /* Scope discovery to this checkout's own sources. Sibling git worktrees
       live under .worktrees and carry their own copies of these tests. */
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
