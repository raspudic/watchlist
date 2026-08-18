import { runLifecycleCleanup } from "../src/lib/lifecycle-cleanup";

async function main() {
  const result = await runLifecycleCleanup();

  if (!result) {
    console.log(JSON.stringify({ event: "lifecycle_cleanup_skipped", reason: "already_running" }));
    return;
  }

  console.log(JSON.stringify({ event: "lifecycle_cleanup_completed", deleted: result }));
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      event: "lifecycle_cleanup_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    }));
    process.exit(1);
  });
