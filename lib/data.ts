import crypto from "crypto";
import { unstable_cache } from "next/cache";
import type { Article } from "./types";
import { fetchAllTrustedFeeds, type FeedItem } from "./rss";
import { generateArticle } from "./ai";

/**
 * NO DATABASE. There is no Postgres, no Prisma, no DATABASE_URL, and no
 * persisted "articles" table anywhere in this codebase. Every page —
 * homepage, category, article, search, /rss.xml, sitemap — is served from
 * one in-memory pipeline, rebuilt directly from the live sources:
 *
 *   RSS feeds -> dedupe -> AI summarize + Bengali translate -> cache -> render
 *
 * "Cache" here is Next.js's built-in Data Cache (`unstable_cache`), which
 * is what gives us both requirements a database used to provide, without
 * one:
 *
 *   - Auto-refresh every 10-15 minutes: `getArticles()` below is cached
 *     for ARTICLE_LIST_REVALIDATE_SECONDS. Requests within that window
 *     are served instantly from cache; once it expires, the next request
 *     triggers a fresh RSS + AI pass in the background while still
 *     serving the last good list (stale-while-revalidate), so nobody
 *     ever waits on a live RSS/AI round-trip and the list keeps updating
 *     with zero manual steps and no scheduler to babysit.
 *   - Cheap repeated refreshes: each article's AI generation is cached
 *     SEPARATELY, keyed by a fingerprint of its source+headline, for
 *     AI_CACHE_REVALIDATE_SECONDS (a few days). A story still sitting in
 *     the RSS feed 10 minutes from now reuses its already-generated
 *     summary/translation instead of re-billing the Gemini API for
 *     identical work every cycle.
 *
 * There is nothing to seed and no migration to run. There is also no
 * mock-data fallback of any kind: if every RSS feed fails, or every item
 * fails AI generation, this throws — surfacing a visible error instead of
 * silently serving demo/placeholder articles.
 */

const ARTICLE_LIST_REVALIDATE_SECONDS = 600; // 10 minutes — the site-wide refresh window
const AI_CACHE_REVALIDATE_SECONDS = 60 * 60 * 24 * 3; // 3 days — per-article AI cache
const RECENCY_WINDOW_MS = 48 * 60 * 60 * 1000; // ignore anything a feed returns older than this
const MAX_ARTICLES = 60; // caps AI spend + page size per refresh cycle
const AI_CONCURRENCY = 5; // parallel Gemini calls per refresh

const BREAKING_WINDOW_MS = 24 * 60 * 60 * 1000;
const TRENDING_WINDOW_MS = 48 * 60 * 60 * 1000;

function isWithin(publishedAt: string, windowMs: number): boolean {
  return Date.now() - new Date(publishedAt).getTime() <= windowMs;
}

/** Stable per-story identifier, used as both the cache key and the article id/slug suffix. */
function fingerprint(item: FeedItem): string {
  return crypto.createHash("sha256").update(`${item.source}|${item.headline}`).digest("hex");
}

/** Lowercased, punctuation-stripped headline — used only to spot the same story reported by multiple sources. */
function normalizeHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

/** Rough reading time from summary length (~200 wpm) — no DB field to store this in, so it's derived at read time. */
function estimateReadingTimeSeconds(paragraphs: string[]): number {
  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  const WORDS_PER_SECOND = 3.3;
  return Math.max(20, Math.round(words / WORDS_PER_SECOND));
}

/**
 * Generates (or reuses a cached generation of) one article's AI summary +
 * Bengali translation. Cached independently per fingerprint so a story
 * that persists across several 10-minute refresh cycles is only ever
 * sent to the model once.
 */
async function generateArticleCached(item: FeedItem, fp: string) {
  const cached = unstable_cache(async () => generateArticle(item), ["briefly-ai-article", fp], {
    revalidate: AI_CACHE_REVALIDATE_SECONDS
  });
  return cached();
}

/** Fixed-concurrency map so a heavy news day doesn't fire dozens of simultaneous Gemini calls. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function buildArticles(): Promise<Article[]> {
  console.log(`[briefly] rebuilding article list at ${new Date().toISOString()}`);

  const { items, feedResults } = await fetchAllTrustedFeeds();
  const okFeeds = feedResults.filter((f) => f.status === "ok").length;
  console.log(`[briefly:rss] ${okFeeds}/${feedResults.length} feed(s) ok, ${items.length} raw item(s) seen`);

  if (feedResults.length > 0 && okFeeds === 0) {
    // Every trusted feed failed on this pass. This is a total pipeline
    // outage, not "a quiet news day" — throw so the page shows a visible
    // error instead of quietly serving an empty or stale list.
    throw new Error(
      `All ${feedResults.length} trusted RSS feeds failed on this pass: ` +
        feedResults.map((f) => `${f.name} — ${f.error}`).join("; ")
    );
  }

  // 1. Only ever consider genuinely current items.
  const recent = items.filter((i) => i.headline && i.sourceUrl && isWithin(i.publishedAt, RECENCY_WINDOW_MS));

  // 2. Dedupe by exact fingerprint, while separately counting how many
  //    distinct sources reported a near-identical headline. With no
  //    database of clicks/views to rank on, that corroboration count
  //    (2+ independent trusted sources covering the same story) is used
  //    below as the "trending" signal instead.
  const uniqueByFingerprint = new Map<string, FeedItem>();
  const corroboratingSources = new Map<string, Set<string>>(); // normalized headline -> sources

  for (const item of recent) {
    const fp = fingerprint(item);
    if (!uniqueByFingerprint.has(fp)) uniqueByFingerprint.set(fp, item);

    const normalized = normalizeHeadline(item.headline);
    const sources = corroboratingSources.get(normalized) ?? new Set<string>();
    sources.add(item.source);
    corroboratingSources.set(normalized, sources);
  }

  // 3. Cap to the most recent N unique stories before spending any AI calls.
  const uniqueItems = Array.from(uniqueByFingerprint.values())
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_ARTICLES);

  console.log(`[briefly] ${uniqueItems.length} unique item(s) after dedupe/cap — generating AI content...`);

  const generated = await mapWithConcurrency(uniqueItems, AI_CONCURRENCY, async (item): Promise<Article | null> => {
    const fp = fingerprint(item);
    try {
      const ai = await generateArticleCached(item, fp);
      const slugBase = slugify(ai.headline || item.headline);
      const normalized = normalizeHeadline(item.headline);
      const sourcesReporting = corroboratingSources.get(normalized)?.size ?? 1;

      return {
        id: fp,
        slug: `${slugBase}-${fp.slice(0, 6)}`,
        headline: ai.headline,
        headlineBn: ai.headlineBn,
        takeaway: ai.takeaway,
        takeawayBn: ai.takeawayBn,
        summaryEn: ai.summaryEn,
        summaryBn: ai.summaryBn,
        category: ai.category,
        source: item.source,
        sourceUrl: item.sourceUrl,
        imageUrl: item.imageUrl,
        publishedAt: item.publishedAt,
        readingTimeSeconds: estimateReadingTimeSeconds(ai.summaryEn),
        isBreaking: ai.isBreaking,
        isTrending: sourcesReporting >= 2,
        tags: ai.tags
      };
    } catch (err) {
      console.error(`[briefly:ai] generation FAILED for "${item.headline}" (${item.source}): ${(err as Error).message}`);
      return null;
    }
  });

  const articles = generated
    .filter((a): a is Article => a !== null)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  console.log(`[briefly] list rebuild complete — ${articles.length}/${uniqueItems.length} article(s) generated`);

  if (articles.length === 0) {
    throw new Error("RSS feeds returned items, but AI generation failed for every one of them — see logs above.");
  }

  return articles;
}

/**
 * The single source of truth for "what's on the site right now." Every
 * route calls this same cached function, so the homepage, category
 * pages, search, /rss.xml, and the sitemap all see one consistent
 * snapshot per refresh window instead of independently re-fetching RSS.
 */
export const getArticles = unstable_cache(buildArticles, ["briefly-articles-list"], {
  revalidate: ARTICLE_LIST_REVALIDATE_SECONDS
});

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
