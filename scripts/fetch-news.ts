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

    if (result.errors.length > 0) {
      console.warn(`[briefly] ${result.errors.length} item(s) failed:`, result.errors);
    }

    // If every attempted item errored out (e.g. an invalid/expired API key,
    // or the database rejecting writes), that's a systemic failure, not
    // "no fresh news right now" — fail the run loudly so GitHub Actions
    // shows a red X and the owner notices, instead of a silent zero-new-
    // articles run that looks identical to a quiet news day.
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
