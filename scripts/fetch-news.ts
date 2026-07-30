import "dotenv/config";
import { runIngestPass } from "../lib/ingest";

if (!process.env.DATABASE_URL) {
  console.error("[briefly] DATABASE_URL is not set — cannot connect to the database. " +
    "Check that it's configured as a GitHub Actions secret (Settings → Secrets and variables → Actions).");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("[briefly] ANTHROPIC_API_KEY is not set — cannot summarize or translate articles. " +
    "Check that it's configured as a GitHub Actions secret.");
  process.exit(1);
}

runIngestPass()
  .then((result) => {
    console.log(`[briefly] seen=${result.itemsSeen} new=${result.itemsNew} skipped=${result.itemsSkipped}`);
    console.log("[briefly] skip breakdown:", result.skipReasons);
    console.log(
      "[briefly] feed breakdown:",
      result.feedResults.map((f) => `${f.name}=${f.status === "ok" ? f.itemCount : "ERROR:" + f.error}`).join(", ")
    );

    if (result.errors.length > 0) {
      console.warn(`[briefly] ${result.errors.length} error(s):`, result.errors);
    }

    const failedFeeds = result.feedResults.filter((f) => f.status === "error").length;

    // Two distinct systemic-failure shapes, both of which used to look
    // identical to "a quiet news day" and exit 0:
    //
    // 1. Every trusted feed failed to fetch — itemsSeen is 0, so there's
    //    nothing to even attempt. The old check here only looked at
    //    `result.errors`, which was never populated by feed-level
    //    failures, so this case always fell through as a silent success.
    if (result.feedResults.length > 0 && failedFeeds === result.feedResults.length) {
      console.error("[briefly] every trusted feed failed — treating this as a failed run.");
      process.exit(1);
    }

    // 2. Every attempted item errored out (e.g. an invalid/expired API
    //    key, or the database rejecting writes) — that's a systemic
    //    failure too, not "no fresh news right now."
    const attempted = result.itemsSeen - result.itemsSkipped + result.errors.length;
    if (result.itemsNew === 0 && result.errors.length > 0 && result.errors.length >= attempted) {
      console.error("[briefly] every attempted item failed — treating this as a failed run.");
      process.exit(1);
    }

    process.exit(0);
  })
  .catch((err) => {
    console.error("[briefly] ingestion pass failed:", err);
    process.exit(1);
  });
