import type { Article } from "./types";
import { MOCK_ARTICLES } from "./mock-data";

const hasDatabase = Boolean(process.env.DATABASE_URL);

/**
 * `isBreaking` / `isTrending` are written once by the AI pipeline at
 * ingest time (see lib/ai.ts) and are never cleared afterwards. On a
 * quiet news day nothing new gets marked breaking, so without a
 * freshness check here the most recent article that ever *was* marked
 * breaking — even one from yesterday or last week — keeps winning
 * `getBreakingArticle()`'s `.find()` forever. That's the "yesterday's
 * news shown as today's breaking news" bug: the flag isn't stale data,
 * it's a flag with no expiry. Filtering by publish time here is a
 * read-time fix (no migration, no cron changes needed) and self-heals
 * automatically as time passes.
 */
const BREAKING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const TRENDING_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

function isWithin(publishedAt: string, windowMs: number): boolean {
  return Date.now() - new Date(publishedAt).getTime() <= windowMs;
}

async function fromDb(): Promise<Article[]> {
  const { prisma } = await import("./db");
  const rows = await prisma.article.findMany({ orderBy: { publishedAt: "desc" } });
  return rows.map((r: (typeof rows)[number]) => ({
    id: r.id,
    slug: r.slug,
    headline: r.headline,
    headlineBn: r.headlineBn,
    takeaway: r.takeaway,
    takeawayBn: r.takeawayBn,
    summaryEn: r.summaryEn,
    summaryBn: r.summaryBn,
    category: r.category as Article["category"],
    source: r.source,
    sourceUrl: r.sourceUrl,
    imageUrl: r.imageUrl,
    imageCredit: r.imageCredit ?? undefined,
    publishedAt: r.publishedAt.toISOString(),
    readingTimeSeconds: r.readingTimeSeconds,
    isBreaking: r.isBreaking,
    isTrending: r.isTrending,
    tags: r.tags
  }));
}

/** All published articles, newest first. */
export async function getArticles(): Promise<Article[]> {
  if (hasDatabase) {
    try {
      return await fromDb();
    } catch {
      return MOCK_ARTICLES;
    }
  }
  return [...MOCK_ARTICLES].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
  const all = await getArticles();
  return all.find((a) => a.slug === slug);
}

export async function getArticlesByCategory(category: string): Promise<Article[]> {
  const all = await getArticles();
  return all.filter((a) => a.category === category);
}

export async function getBreakingArticle(): Promise<Article | undefined> {
  const all = await getArticles();
  return all.find((a) => a.isBreaking && isWithin(a.publishedAt, BREAKING_WINDOW_MS));
}

export async function getTrendingArticles(): Promise<Article[]> {
  const all = await getArticles();
  return all.filter((a) => a.isTrending && isWithin(a.publishedAt, TRENDING_WINDOW_MS));
}

export async function searchArticles(query: string): Promise<Article[]> {
  const all = await getArticles();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return all.filter((a) =>
    [a.headline, a.headlineBn, a.category, a.source, ...a.tags]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}
