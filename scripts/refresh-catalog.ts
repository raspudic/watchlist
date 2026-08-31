import { runCatalogRefresh } from "../src/lib/catalog-refresh";

async function main() {
  if (!process.env.TMDB_ACCESS_TOKEN) {
    throw new Error("TMDB_ACCESS_TOKEN is required for the catalog refresh job.");
  }

  const result = await runCatalogRefresh();
  if (!result) {
    console.log(JSON.stringify({ event: "catalog_refresh_skipped", reason: "already_running" }));
    return;
  }

  console.log(JSON.stringify({ event: "catalog_refresh_completed", ...result }));
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      event: "catalog_refresh_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    }));
    process.exit(1);
  });
