import crypto from "crypto";
import { fetchAllTrustedFeeds, TRUSTED_SOURCES, type FeedItem } from "./rss";
import { generateArticle, isDuplicateStory } from "./ai";
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

export interface IngestSummary {
  itemsSeen: number;
  itemsNew: number;
  itemsSkipped: number;
  errors: string[];
}

/**
 * Runs one full ingestion pass: pulls every trusted RSS feed, filters out
 * anything already published or clearly a duplicate of an existing story,
 * then runs the remaining items through the AI pipeline and writes new
 * Article rows. Designed to be safe to call every few minutes — it's a
 * no-op for stories it has already published.
 */
export async function runIngestPass(): Promise<IngestSummary> {
  const items = await fetchAllTrustedFeeds();
  const errors: string[] = [];
  let itemsNew = 0;
  let itemsSkipped = 0;

  const existingHeadlines = (
    await prisma.article.findMany({
      select: { headline: true },
      orderBy: { publishedAt: "desc" },
      take: 200
    })
  ).map((a: { headline: string }) => a.headline);

  for (const item of items) {
    if (!item.headline || !item.sourceUrl) {
      itemsSkipped++;
      continue;
    }

    const fp = fingerprint(item);
    const alreadyExists = await prisma.article.findUnique({ where: { fingerprint: fp } });
    if (alreadyExists) {
      itemsSkipped++;
      continue;
    }

    try {
      const duplicate = await isDuplicateStory(item.headline, existingHeadlines);
      if (duplicate) {
        itemsSkipped++;
        continue;
      }

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

      existingHeadlines.push(generated.headline);
      itemsNew++;
    } catch (err) {
      errors.push(`${item.source} — ${item.headline}: ${(err as Error).message}`);
      itemsSkipped++;
    }
  }

  await prisma.ingestLog.create({
    data: {
      feedName: TRUSTED_SOURCES.map((f) => f.name).join(", "),
      itemsSeen: items.length,
      itemsNew,
      itemsSkipped,
      errorMessage: errors.length ? errors.slice(0, 5).join(" | ") : null
    }
  });

  return { itemsSeen: items.length, itemsNew, itemsSkipped, errors };
}
