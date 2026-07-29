import "dotenv/config";
import { runIngestPass } from "../lib/ingest";

runIngestPass()
  .then((result) => {
    console.log(`[briefly] seen=${result.itemsSeen} new=${result.itemsNew} skipped=${result.itemsSkipped}`);
    if (result.errors.length) console.warn("[briefly] errors:", result.errors);
    process.exit(0);
  })
  .catch((err) => {
    console.error("[briefly] ingestion pass failed:", err);
    process.exit(1);
  });
