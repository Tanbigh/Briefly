import crypto from "crypto";
import { unstable_cache } from "next/cache";
import type { Article } from "./types";
import { fetchAllTrustedFeeds, type FeedItem } from "./rss";
import { generateArticle, type GeneratedArticle } from "./ai";

/**
 * NO DATABASE. There is no Postgres, no Prisma, no DATABASE_URL, and no
 * persisted "articles" table anywhere in this codebase. Every page —
 * homepage, category, article, search, /rss.xml, sitemap — is served from
 * one in-memory pipeline, rebuilt directly from the live sources:
 *
 *   RSS feeds -> dedupe -> AI summarize + exam-relevance judge -> cache -> render
 *
 * ---------------------------------------------------------------------
 * WHY THIS FILE LOOKS THE WAY IT DOES (read this before touching it)
 * ---------------------------------------------------------------------
 *
 * This pipeline runs on Vercel Hobby, calling an external LLM (Gemini)
 * that has a hard 5 requests/minute free-tier quota (see lib/ai.ts). Three
 * failure modes have to be designed around explicitly, or the homepage
 * goes down every time Gemini is even briefly unavailable:
 *
 * 1. AI FAILURE MUST NEVER BE TREATED AS PIPELINE FAILURE.
 *    `buildArticles()` throws in exactly one situation: every single
 *    trusted RSS feed failed, meaning there is no source data to build
 *    from at all. It NEVER throws just because Gemini rate-limited us or
 *    a generation call failed — that's an expected, transient condition,
 *    not an outage. If AI generation produces nothing new this cycle, we
 *    still return whatever we already have (reused/cached articles), or
 *    an empty list if there's truly nothing yet — never a crash.
 *
 * 2. STALE-WHILE-REVALIDATE IS WHAT ACTUALLY PROTECTS THE HOMEPAGE.
 *    `getArticles` below is wrapped in `unstable_cache` with a 10-minute
 *    revalidate window. When that cache is stale, Next.js serves the
 *    last cached (stale) result to the current request immediately and
 *    kicks off a fresh `buildArticles()` call in the background; if that
 *    background call throws, the existing cached value is left in place
 *    and keeps being served. Because of rule #1, this means: as long as
 *    RSS is up, a previously-successful article list survives a Gemini
 *    outage indefinitely — no manual "last known good" store is needed;
 *    it's a property of never throwing for AI-only failure.
 *    The only case with nothing to fall back to is a genuine cache MISS
 *    (e.g. the very first request after a deploy). In that case:
 *      - RSS ok, AI totally unavailable -> return `[]` (not an error;
 *        the homepage can render an empty/loading state).
 *      - RSS itself failed too -> throw (there is truly nothing to show).
 *
 * 3. CONCURRENT REQUESTS MUST NOT MULTIPLY GEMINI LOAD.
 *    `unstable_cache` does not guarantee that simultaneous calls to the
 *    same cache key are coalesced into a single execution. Under real
 *    traffic, several requests can all observe a stale/missing cache at
 *    the same moment and each independently trigger their own
 *    `buildArticles()` run — each with its own "5 new articles" budget,
 *    which is how a handful of concurrent page loads turns into dozens
 *    of simultaneous Gemini calls and a 429 storm. `buildArticlesCoalesced`
 *    below fixes this with a module-level in-flight promise: concurrent
 *    callers on the SAME warm serverless instance share one rebuild.
 *    (This does not protect against two different cold-start Lambda
 *    instances racing at the exact same instant — a true cross-instance
 *    lock needs external shared state, e.g. Vercel KV/Upstash Redis,
 *    which is intentionally out of scope for this no-database project.
 *    In practice, per-instance coalescing removes the vast majority of
 *    duplicate rebuild load.)
 *
 * On top of that, new AI generation is both budgeted (at most
 * MAX_NEW_ARTICLES_PER_REFRESH brand-new Gemini calls per refresh cycle)
 * and time-boxed (NEW_ARTICLE_TIME_BUDGET_MS shared wall-clock deadline,
 * kept comfortably above lib/ai.ts's MIN_MS_BETWEEN_CALLS spacing so real
 * generations aren't discarded before they can even start — see the note
 * on NEW_ARTICLE_TIME_BUDGET_MS below), so a refresh can never be stuck
 * waiting on Gemini's pacing long enough to blow Vercel Hobby's function
 * timeout. Anything that doesn't finish in time is simply deferred to the
 * next 10-minute cycle — no story is lost, and cached (previously
 * generated) articles are unaffected by any of this, since they resolve
 * immediately with zero Gemini calls.
 *
 * ---------------------------------------------------------------------
 * EXAM-RELEVANCE RANKING AND FILTERING
 * ---------------------------------------------------------------------
 * Briefly's audience is competitive-exam aspirants (UPSC/WBCS/SSC/Banking/
 * Railway/State PSC), not general news readers. lib/ai.ts asks Gemini to
 * judge each story's exam relevance and assign an `importanceScore`
 * (0-100). This file uses that score, not publish time, as the PRIMARY
 * sort key for the article list — see `rankArticles()` below — and drops
 * stories that score below MIN_IMPORTANCE_SCORE_TO_KEEP (routine
 * entertainment/lifestyle/viral noise) unless they're independently
 * newsworthy (breaking, or corroborated by several trusted sources).
 *
 * HONEST LIMITATION — "5-10 articles per category": with a 5
 * requests/minute free Gemini quota, this pipeline can generate at most a
 * handful of brand-new articles every 10-minute refresh (see
 * MAX_NEW_ARTICLES_PER_REFRESH). Category depth is something that
 * accumulates over hours via the 3-day per-article cache
 * (AI_CACHE_REVALIDATE_SECONDS), not something achievable from a cold
 * cache in one request. MAX_ARTICLES (the RSS candidate pool size) is set
 * well above what one refresh could ever generate, specifically so that,
 * as the per-article cache fills in over successive cycles, there's
 * enough breadth of already-classified stories for every category to
 * plausibly reach that depth over time. If a category consistently stays
 * thin, that's a sign that RECENCY_WINDOW_MS or MAX_ARTICLES need
 * widening further, or that TRUSTED_SOURCES needs a source that actually
 * covers that topic — not something a request-time fix can solve.
 */

const ARTICLE_LIST_REVALIDATE_SECONDS = 600; // 10 minutes — the site-wide refresh window
const AI_CACHE_REVALIDATE_SECONDS = 60 * 60 * 24 * 3; // 3 days — per-article AI cache

// How far back a story can be and still be considered. Widened from the
// original 48h to 72h: exam aspirants care about "this week's" current
// affairs, not just "today's" news, and a wider window gives the pipeline
// more raw material to build category depth from across refresh cycles.
const RECENCY_WINDOW_MS = 72 * 60 * 60 * 1000;

// How many *candidate* stories we even look at per refresh. This is a
// sanity cap on pool size, not a cost control — reused/cached articles
// are free (zero Gemini calls). The real spend limiter is
// MAX_NEW_ARTICLES_PER_REFRESH below. Raised from 40 to 150: with 13
// trusted feeds pooling into one 72-hour window, 40 was cutting the
// candidate pool down before category diversity (govt/economy/science/
// defence/etc, not just whatever's most recent) had a chance to show up.
const MAX_ARTICLES = Number(process.env.MAX_ARTICLES || 150);

// At most this many stories are ever sent to Gemini for the FIRST time in
// a single refresh cycle. Checked/incremented *inside* the function passed
// to unstable_cache in generateArticleCached, which Next only invokes on a
// genuine cache miss — so it only ever counts real new-generation
// attempts, never cache hits. A throw from that inner function is never
// cached, so a skipped story is retried as an ordinary cache miss on the
// next refresh. No story is lost, just deferred.
const MAX_NEW_ARTICLES_PER_REFRESH = Number(process.env.MAX_NEW_ARTICLES_PER_REFRESH || 5);

// A hard wall-clock deadline for how long a single refresh will wait on
// NEW generations, shared across every item in that refresh (not "N
// seconds per item"). Reused/cached articles never touch this deadline.
// Whichever new-generation calls haven't resolved when it expires are
// treated as "not ready" for this cycle (skipped, retried next time) —
// the underlying call may keep running in the background, but the
// response is never blocked on it.
//
// MUST stay comfortably above lib/ai.ts's MIN_MS_BETWEEN_CALLS (the
// minimum spacing enforced between actual outbound Gemini calls). Every
// item in this refresh shares ONE outbound-call queue in lib/ai.ts, so
// only the first item can start immediately — everything after it is
// serialized behind MIN_MS_BETWEEN_CALLS. A deadline shorter than that
// spacing guarantees every slot after the first is discarded every
// cycle, and leaves the first slot with no room for ordinary latency.
// 45s clears 13s of queue spacing plus normal Gemini round-trip time
// (and the one allowed 429 retry) with real margin. If you raise
// GEMINI_MIN_MS_BETWEEN_CALLS in lib/ai.ts, raise this too — it should
// stay well above that value, not just barely over it.
const NEW_ARTICLE_TIME_BUDGET_MS = Number(process.env.NEW_ARTICLE_TIME_BUDGET_MS || 45000);

const AI_CONCURRENCY = 5; // bounds in-flight cache reads/promises; real Gemini call pacing is enforced in lib/ai.ts

const BREAKING_WINDOW_MS = 24 * 60 * 60 * 1000;
const TRENDING_WINDOW_MS = 48 * 60 * 60 * 1000;

// Stories the AI scores below this are routine/trivial/entertainment
// noise (see the examRelevance rules in lib/ai.ts) and are dropped from
// the public site — UNLESS they're independently newsworthy (breaking,
// or reported by several trusted sources at once, which is a strong
// signal a "low-relevance-looking" story is actually a big national
// moment the AI under-scored). This keeps the site focused on exam-useful
// content without hard-coding a category blocklist.
const MIN_IMPORTANCE_SCORE_TO_KEEP = Number(process.env.MIN_IMPORTANCE_SCORE_TO_KEEP || 20);
const MIN_CORROBORATING_SOURCES_TO_OVERRIDE_LOW_SCORE = 3;

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
 * Ranks by importance first (exam significance, as judged by the AI),
 * recency second. Replaces the old "most recent first" sort: a Budget
 * announcement from yesterday is more exam-relevant than a routine story
 * from ten minutes ago, and this is what actually delivers "rank by
 * importance, not only publication time."
 */
function rankArticles(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => {
    if (b.importanceScore !== a.importanceScore) return b.importanceScore - a.importanceScore;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

/** Thrown (and never cached) when this refresh has already spent its new-generation budget. */
class GenerationBudgetExceeded extends Error {}

/** Thrown (and never cached) when the refresh's shared time budget has already run out. */
class GenerationTimedOut extends Error {}

/** Fine-grained outcome for one story's AI generation attempt — used for both control flow and diagnostics. */
type GenerationOutcome =
  | { status: "hit" | "generated"; article: GeneratedArticle }
  | { status: "skipped-budget" | "skipped-deadline" | "failed" };

/**
 * Generates (or reuses a cached generation of) one article's AI summary +
 * Bengali translation + exam-relevance judgment.
 *
 * - Cache HIT (already generated within AI_CACHE_REVALIDATE_SECONDS):
 *   resolves immediately, zero Gemini calls, budget/deadline irrelevant.
 * - Cache MISS (brand-new story, or one whose 3-day AI cache expired):
 *   the function passed to unstable_cache only runs in this case, which
 *   is exactly where we gate on the per-refresh budget and deadline. A
 *   throw here is never cached by unstable_cache, so a skipped story is
 *   retried as a plain cache miss on the next refresh.
 *
 * Never throws: every failure mode (budget exhausted, deadline passed,
 * or a genuine Gemini error/429 after retries) resolves to a typed
 * `GenerationOutcome`, which the caller uses purely for bookkeeping.
 */
async function generateArticleCached(
  item: FeedItem,
  fp: string,
  budget: { count: number },
  deadlineMs: number
): Promise<GenerationOutcome> {
  let ranFreshGeneration = false;

  const cached = unstable_cache(
    async () => {
      if (budget.count >= MAX_NEW_ARTICLES_PER_REFRESH) {
        throw new GenerationBudgetExceeded();
      }
      if (Date.now() >= deadlineMs) {
        throw new GenerationTimedOut();
      }
      budget.count++;
      ranFreshGeneration = true;
      return generateArticle(item);
    },
    ["briefly-ai-article", fp],
    { revalidate: AI_CACHE_REVALIDATE_SECONDS }
  );

  const remainingMs = Math.max(0, deadlineMs - Date.now());

  try {
    const result = await Promise.race([
      cached(),
      new Promise<"TIMEOUT">((resolve) => setTimeout(() => resolve("TIMEOUT"), remainingMs))
    ]);

    if (result === "TIMEOUT") {
      return { status: "skipped-deadline" };
    }
    return { status: ranFreshGeneration ? "generated" : "hit", article: result };
  } catch (err) {
    if (err instanceof GenerationBudgetExceeded) return { status: "skipped-budget" };
    if (err instanceof GenerationTimedOut) return { status: "skipped-deadline" };

    // A genuine failure (Gemini 429 after retries, network error, bad
    // response, etc). Logged here so it's visible, but deliberately never
    // rethrown — this must never be allowed to fail the whole refresh.
    console.warn(
      `[briefly:ai] generation failed for "${item.headline}" (${item.source}): ${(err as Error).message}`
    );
    return { status: "failed" };
  }
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
  if (process.env.NEXT_PHASE === "phase-production-build") {
    // Every data-driven route in this app is marked `dynamic = "force-dynamic"`
    // (see app/page.tsx, app/sitemap.ts, app/rss.xml/route.ts,
    // app/category/[category]/page.tsx) specifically so nothing runs the live
    // RSS/Gemini pipeline at build time. Despite that, `next build` still
    // performs a one-off trial invocation of each route while collecting page
    // data/traces, purely to catch errors early — and since there's no
    // guaranteed live network/API access during that build step, letting
    // this throw here would abort the entire deployment. Skipping it during
    // this specific phase is safe: force-dynamic routes are re-executed on
    // every real request in production, so this build-time result is never
    // what an actual visitor sees.
    console.log("[briefly] next build phase detected — skipping live RSS/AI pipeline for the build-time trial render");
    return [];
  }

  console.log(`[briefly] rebuilding article list at ${new Date().toISOString()}`);

  const { items, feedResults } = await fetchAllTrustedFeeds();
  const okFeeds = feedResults.filter((f) => f.status === "ok").length;
  console.log(`[briefly:rss] ${okFeeds}/${feedResults.length} feed(s) ok, ${items.length} raw item(s) seen`);

  if (feedResults.length > 0 && okFeeds === 0) {
    // Every trusted feed failed on this pass — there is no source data at
    // all to build from. This is the ONLY throw path in this entire file.
    // If a previously-successful (stale) article list exists in the Data
    // Cache, this throw happens inside a background revalidation and never
    // reaches a real request — Next.js keeps serving the last good list.
    // It only surfaces to an actual page load on a genuine cache miss
    // (nothing has ever been built yet), which is exactly when there is
    // truly nothing to show.
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
  //    below both as the "trending" signal and as a safety net that can
  //    pull a story back in even if the AI scored it as low-importance.
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

  // 3. Cap to the most recent N unique stories before considering any of
  //    them for AI generation. Most of these will be cheap cache hits;
  //    MAX_NEW_ARTICLES_PER_REFRESH is what actually caps Gemini spend.
  const uniqueItems = Array.from(uniqueByFingerprint.values())
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_ARTICLES);

  console.log(
    `[briefly] ${uniqueItems.length} unique item(s) after dedupe/cap — reusing cached AI content where possible, ` +
      `generating at most ${MAX_NEW_ARTICLES_PER_REFRESH} new article(s) within a ${NEW_ARTICLE_TIME_BUDGET_MS}ms budget...`
  );

  // Shared across every item processed in this refresh: `budget` limits
  // how many brand-new Gemini calls this cycle may trigger, and
  // `deadlineMs` is the single wall-clock cutoff every new-generation
  // attempt races against. Both are scoped to this one buildArticles()
  // call (not the module), so each refresh gets a fresh allowance.
  const newArticleBudget = { count: 0 };
  const deadlineMs = Date.now() + NEW_ARTICLE_TIME_BUDGET_MS;

  const counts = { hit: 0, generated: 0, skippedBudget: 0, skippedDeadline: 0, failed: 0, droppedLowValue: 0 };

  const generated = await mapWithConcurrency(uniqueItems, AI_CONCURRENCY, async (item): Promise<Article | null> => {
    const fp = fingerprint(item);
    const outcome = await generateArticleCached(item, fp, newArticleBudget, deadlineMs);

    switch (outcome.status) {
      case "hit":
        counts.hit++;
        break;
      case "generated":
        counts.generated++;
        break;
      case "skipped-budget":
        counts.skippedBudget++;
        return null;
      case "skipped-deadline":
        counts.skippedDeadline++;
        return null;
      case "failed":
        counts.failed++;
        return null;
    }

    const ai = outcome.article;
    const normalized = normalizeHeadline(item.headline);
    const sourcesReporting = corroboratingSources.get(normalized)?.size ?? 1;

    // Exam-relevance gate: routine/entertainment/trivial stories are
    // dropped, unless the story is independently newsworthy (breaking, or
    // corroborated by several trusted sources — a sign the AI likely
    // under-scored something that's actually a big national moment).
    const isLowValue = ai.importanceScore < MIN_IMPORTANCE_SCORE_TO_KEEP;
    const hasIndependentSignal = ai.isBreaking || sourcesReporting >= MIN_CORROBORATING_SOURCES_TO_OVERRIDE_LOW_SCORE;
    if (isLowValue && !hasIndependentSignal) {
      counts.droppedLowValue++;
      return null;
    }

    const slugBase = slugify(ai.headline || item.headline);

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
      tags: ai.tags,
      examRelevance: ai.examRelevance,
      importanceScore: ai.importanceScore,
      keyFacts: ai.keyFacts,
      organizations: ai.organizations,
      importantDates: ai.importantDates,
      whyItMatters: ai.whyItMatters,
      possibleExamQuestion: ai.possibleExamQuestion || undefined,
      prelimsFacts: ai.prelimsFacts.length > 0 ? ai.prelimsFacts : undefined
    };
  });

  const articles = rankArticles(generated.filter((a): a is Article => a !== null));

  console.log(
    `[briefly] list rebuild complete — ${articles.length}/${uniqueItems.length} article(s) available ` +
      `(cache hits: ${counts.hit}, newly generated: ${counts.generated}, ` +
      `skipped — budget: ${counts.skippedBudget}, skipped — deadline: ${counts.skippedDeadline}, ` +
      `failed: ${counts.failed}, dropped — low exam-relevance: ${counts.droppedLowValue})`
  );

  if (articles.length === 0) {
    // Deliberately NOT an error. RSS succeeded (we already returned above
    // if it didn't) but nothing — cached or new — was available this
    // cycle. This can legitimately happen on the very first request ever
    // (nothing generated yet) combined with Gemini being unavailable. The
    // homepage renders an empty state rather than crashing; the next
    // refresh cycle (or the next request, once the per-article caches
    // start filling in) will pick stories back up automatically.
    console.warn("[briefly] no articles available this cycle (RSS ok, no cached or newly generated content) — returning empty list, not an error");
  }

  return articles;
}

// Per-instance guard against concurrent rebuilds. `unstable_cache` does not
// guarantee that simultaneous calls to the same key are coalesced into a
// single execution — under real concurrent traffic, several requests can
// each observe a stale/missing cache at the same moment and each
// independently trigger their own `buildArticles()` run, multiplying
// Gemini load and worsening rate limiting. This ensures that, within a
// single warm serverless instance, concurrent callers share one in-flight
// rebuild instead of starting their own.
//
// This does NOT provide a cross-instance/cross-region lock — two different
// cold-start Lambda instances can still race at the same instant. A true
// global mutex would need external shared state (e.g. Vercel KV / Upstash
// Redis), which is intentionally out of scope for this no-database
// project. In practice this removes the large majority of duplicate
// rebuild load, which is what concurrent page loads on a warm instance
// actually look like.
let inFlightRebuild: Promise<Article[]> | null = null;

async function buildArticlesCoalesced(): Promise<Article[]> {
  if (inFlightRebuild) {
    console.log("[briefly] rebuild already in progress on this instance — reusing in-flight result instead of starting another");
    return inFlightRebuild;
  }

  inFlightRebuild = buildArticles().finally(() => {
    inFlightRebuild = null;
  });

  return inFlightRebuild;
}

/**
 * The single source of truth for "what's on the site right now." Every
 * route calls this same cached function, so the homepage, category
 * pages, search, /rss.xml, and the sitemap all see one consistent
 * snapshot per refresh window instead of independently re-fetching RSS.
 *
 * Wrapping `buildArticlesCoalesced` (not `buildArticles` directly) means
 * the in-flight-rebuild guard applies before Next's own cache lookup logic
 * runs, so concurrent stale/miss hits on this instance share one rebuild.
 */
export const getArticles = unstable_cache(buildArticlesCoalesced, ["briefly-articles-list"], {
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

/** High exam-relevance articles, already ranked by importance — the "Today's Brief" candidate set. */
export async function getHighExamRelevanceArticles(): Promise<Article[]> {
  const all = await getArticles();
  return all.filter((a) => a.examRelevance === "High");
}

export async function searchArticles(query: string): Promise<Article[]> {
  const all = await getArticles();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return all.filter((a) =>
    [a.headline, a.headlineBn, a.category, a.source, ...a.tags, ...a.organizations]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}