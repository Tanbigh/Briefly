import crypto from "crypto";
import { fetchAllTrustedFeeds, TRUSTED_SOURCES, type FeedItem, type FeedResult } from "./rss";
import { generateArticle } from "./ai";
import { prisma } from "./db";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function fingerprint(item: FeedItem): string {
  return crypto.createHash("sha256").update(`${item.source}|${item.headline}`).digest("hex");
}

/** Lowercased, punctuation-stripped headline, used only for near-duplicate comparison. */
function normalizeHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface IngestSummary {
  itemsSeen: number;
  itemsNew: number;
  itemsSkipped: number;
  /** Breakdown of *why* items were skipped — this is what makes a "0 new
   *  articles" run debuggable instead of a black box. */
  skipReasons: {
    missingFields: number;
    existingFingerprint: number;
    nearDuplicateHeadline: number;
    generationError: number;
  };
  feedResults: FeedResult[];
  errors: string[];
}

/**
 * Runs one full ingestion pass: pulls every trusted RSS feed, filters out
 * anything already published or a near-duplicate of an existing story,
 * then runs the remaining items through the AI pipeline and writes new
 * Article rows. Designed to be safe to call every few minutes — it's a
 * no-op for stories it has already published.
 *
 * Duplicate detection is intentionally deterministic (hash + normalized
 * headline match) rather than an extra AI call per item — a model-judged
 * "is this a duplicate?" check can misfire, and a false "yes" silently
 * discards a genuinely new story with no visible error. Plain string
 * comparison can't do that.
 *
 * Every step logs to the console (visible in `npm run fetch-news` output
 * and in the GitHub Actions run log) so a run that produces zero new
 * articles can be diagnosed from the log alone: how many items came back
 * per feed, how many were skipped and why, and how many AI/DB writes
 * failed.
 */
export async function runIngestPass(): Promise<IngestSummary> {
  console.log(`[briefly] ingest pass starting at ${new Date().toISOString()}`);

  const { items, feedResults } = await fetchAllTrustedFeeds();
  const failedFeeds = feedResults.filter((f) => f.status === "error");
  const errors: string[] = failedFeeds.map((f) => `feed:${f.name} — ${f.error}`);

  console.log(
    `[briefly] feeds: ${feedResults.length - failedFeeds.length}/${feedResults.length} ok, ` +
      `${items.length} raw item(s) seen`
  );
  if (failedFeeds.length === feedResults.length) {
    console.error(
      "[briefly] every trusted feed failed this run — 0 items were fetched. " +
        "This is a total pipeline outage, not a quiet news day."
    );
  }

  let itemsNew = 0;
  let itemsSkipped = 0;
  const skipReasons = {
    missingFields: 0,
    existingFingerprint: 0,
    nearDuplicateHeadline: 0,
    generationError: 0
  };

  const recentArticles = await prisma.article.findMany({
    select: { headline: true },
    orderBy: { publishedAt: "desc" },
    take: 200
  });
  const recentNormalized = new Set(recentArticles.map((a: { headline: string }) => normalizeHeadline(a.headline)));
  console.log(`[briefly] loaded ${recentArticles.length} recent headline(s) for dedup comparison`);

  for (const item of items) {
    if (!item.headline || !item.sourceUrl) {
      itemsSkipped++;
      skipReasons.missingFields++;
      continue;
    }

    const fp = fingerprint(item);
    const normalized = normalizeHeadline(item.headline);

    const alreadyExists = await prisma.article.findUnique({ where: { fingerprint: fp } });
    if (alreadyExists) {
      itemsSkipped++;
      skipReasons.existingFingerprint++;
      continue;
    }
    if (recentNormalized.has(normalized)) {
      itemsSkipped++;
      skipReasons.nearDuplicateHeadline++;
      continue;
    }

    try {
      const generated = await generateArticle({
        headline: item.headline,
        description: item.description,
        source: item.source,
        sourceUrl: item.sourceUrl,
        publishedAt: item.publishedAt
      });

      const slugBase = slugify(generated.headline);
      const slug = `${slugBase}-${fp.slice(0, 6)}`;

      await prisma.article.create({
        data: {
          slug,
          headline: generated.headline,
          headlineBn: generated.headlineBn,
          takeaway: generated.takeaway,
          takeawayBn: generated.takeawayBn,
          summaryEn: generated.summaryEn,
          summaryBn: generated.summaryBn,
          category: generated.category,
          source: item.source,
          sourceUrl: item.sourceUrl,
          imageUrl: item.imageUrl,
          publishedAt: new Date(item.publishedAt),
          readingTimeSeconds: 35,
          isBreaking: generated.isBreaking,
          isTrending: false,
          tags: generated.tags,
          fingerprint: fp
        }
      });

      recentNormalized.add(normalized);
      itemsNew++;
      console.log(`[briefly] inserted — [${item.source}] "${generated.headline}" (slug=${slug})`);
    } catch (err) {
      const message = (err as Error).message;
      errors.push(`item:${item.source} — ${item.headline}: ${message}`);
      skipReasons.generationError++;
      itemsSkipped++;
      console.error(`[briefly] item FAILED — [${item.source}] "${item.headline}": ${message}`);
    }
  }

  console.log(
    `[briefly] ingest pass done — seen=${items.length} new=${itemsNew} skipped=${itemsSkipped} ` +
      `(missingFields=${skipReasons.missingFields}, existingFingerprint=${skipReasons.existingFingerprint}, ` +
      `nearDuplicateHeadline=${skipReasons.nearDuplicateHeadline}, generationError=${skipReasons.generationError})`
  );

  await prisma.ingestLog.create({
    data: {
      feedName: TRUSTED_SOURCES.map((f) => f.name).join(", "),
      itemsSeen: items.length,
      itemsNew,
      itemsSkipped,
      errorMessage: errors.length ? errors.slice(0, 10).join(" | ") : null,
      details: { feedResults, skipReasons }
    }
  });

  return { itemsSeen: items.length, itemsNew, itemsSkipped, skipReasons, feedResults, errors };
}
