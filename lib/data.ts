import crypto from "crypto";
import { unstable_cache } from "next/cache";
import type { Article } from "./types";
import { fetchAllTrustedFeeds, type FeedItem, type FeedResult } from "./rss";
import { generateArticle, type GeneratedArticle } from "./ai";
import { readSnapshot, writeSnapshot, type Snapshot } from "./snapshot";

/**
 * NO DATABASE (still true). There is no Postgres, no Prisma, no
 * DATABASE_URL, and no "articles" table anywhere. There is exactly one
 * piece of persistent state — a single JSON snapshot in Redis (see
 * lib/snapshot.ts) — everything else is still derived live from RSS + AI.
 *
 *   RSS feeds -> dedupe -> AI summarize + exam-relevance judge -> merge
 *   into snapshot -> pages just read the snapshot
 *
 * ---------------------------------------------------------------------
 * WHY THIS FILE CHANGED SHAPE (read this before touching it)
 * ---------------------------------------------------------------------
 * The previous version ran the full RSS+AI pipeline live, inside
 * `unstable_cache`, triggered by whichever page request happened to hit
 * a stale/missing cache. That coupled article generation to Vercel's
 * per-request function timeout — 10s by default on Hobby, 60s max even
 * when explicitly configured — while Gemini's free-tier quota forces a
 * hard 13s minimum spacing between calls (see lib/ai.ts). Do the
 * arithmetic: a page load could physically not survive long enough for
 * more than one or two Gemini calls to complete, no matter what internal
 * "budget" the code thought it had. That's what produced the "only one
 * article on the homepage" symptom — not a bug in the RSS or ranking
 * logic, but the wrong process being asked to do the generation at all.
 *
 * The fix is architectural, not a bigger number: AI generation no longer
 * happens inside any page request.
 *
 *   1. `refreshArticles()` is the only thing that runs the live pipeline.
 *      It's called from ONE place: app/api/cron/refresh/route.ts, which
 *      an external scheduler (GitHub Actions, since Vercel's own Hobby
 *      cron only fires once/day — see that route's comments) hits every
 *      ~10 minutes. That route sets its own `maxDuration = 60` (Hobby's
 *      ceiling) DEDICATED to this one job — not shared with a visitor's
 *      page load — so NEW_ARTICLE_TIME_BUDGET_MS below can actually use
 *      most of that window instead of a few leftover seconds.
 *
 *   2. `getArticles()` (and everything built on it — getArticleBySlug,
 *      getArticlesByCategory, /rss.xml, the sitemap, search, etc.) now
 *      does exactly one cheap thing: read the last snapshot written by
 *      step 1 out of Redis. No RSS fetch, no Gemini call, ever, in a page
 *      request. This is why every one of those functions below kept the
 *      exact same name and signature as before — nothing calling them
 *      needs to change.
 *
 *   3. "Never replace the snapshot with an empty or partial result": see
 *      `refreshArticles()` and `mergeArticles()`. A refresh only ever
 *      writes a new snapshot when the pipeline produced at least one
 *      article, and even then it's merged with (not swapped for) the
 *      previous snapshot, so a temporarily thin cycle (a few feeds down,
 *      Gemini briefly slow) can only ever add to what's on the site, not
 *      shrink it. A fully failed cycle (all RSS down, or zero articles
 *      produced) leaves the stored snapshot completely untouched.
 *
 * The per-article AI cache (`generateArticleCached`, 3-day revalidate)
 * is unchanged and still uses Next's `unstable_cache` / Vercel Data
 * Cache — that part was never the problem, and reusing it means
 * `refreshArticles()` still gets "free" (zero-Gemini-call) reuse of
 * everything generated in earlier cycles.
 *
 * ---------------------------------------------------------------------
 * EXAM-RELEVANCE RANKING AND FILTERING (unchanged)
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
 * "5-10 articles, reliably": with a dedicated ~55s cron budget instead of
 * a shared page-load budget, one refresh cycle can now complete several
 * new Gemini generations (see NEW_ARTICLE_TIME_BUDGET_MS) rather than
 * ~1. Combined with the merge-not-replace snapshot logic, article count
 * accumulates across cycles (running every ~10 minutes) rather than
 * resetting, so the site should reach and hold MIN_DESIRED_ARTICLES
 * within the first hour after this ships, and indefinitely afterward as
 * long as RSS sources keep producing recent stories. MIN_DESIRED_ARTICLES
 * is a logging/health-check threshold only — it doesn't change filtering
 * behavior — see /api/debug/news.
 */

const AI_CACHE_REVALIDATE_SECONDS = 60 * 60 * 24 * 3; // 3 days — per-article AI cache, unchanged

// How far back a story can be and still be considered fresh input for a
// pipeline run.
const RECENCY_WINDOW_MS = 72 * 60 * 60 * 1000;

// Extra grace period an already-snapshotted article gets before
// mergeArticles() drops it, beyond RECENCY_WINDOW_MS. This is what stops
// an article from vanishing from the site the instant it crosses the 72h
// line — it lingers a bit longer, naturally falling off the bottom of the
// ranking as newer/more important stories take its place, rather than
// disappearing abruptly mid-cycle.
const STALE_GRACE_MS = 24 * 60 * 60 * 1000;

// Upper bound on how many articles the snapshot ever holds. Generous
// headroom above MIN_DESIRED_ARTICLES so category pages have real depth
// to draw from, without the snapshot growing unbounded.
const MAX_SNAPSHOT_ARTICLES = Number(process.env.MAX_SNAPSHOT_ARTICLES || 60);

// Purely a logging/health-check target ("are we where we want to be"),
// checked in refreshArticles() and exposed via /api/debug/news. Does NOT
// gate what's shown — the site always shows whatever the merged snapshot
// contains, per the "always try to maintain 5-10" goal, not a hard floor
// enforced by holding back a response.
const MIN_DESIRED_ARTICLES = Number(process.env.MIN_DESIRED_ARTICLES || 8);

// How many *candidate* stories a single refresh even looks at. A sanity
// cap on pool size, not a cost control — reused/cached articles are free
// (zero Gemini calls). The real spend limiter is MAX_NEW_ARTICLES_PER_REFRESH.
const MAX_ARTICLES = Number(process.env.MAX_ARTICLES || 150);

// At most this many stories are sent to Gemini for the FIRST time in a
// single refresh cycle. Checked/incremented *inside* the function passed
// to unstable_cache in generateArticleCached, which Next only invokes on
// a genuine cache miss — so it only ever counts real new-generation
// attempts, never cache hits. A throw from that inner function is never
// cached, so a skipped story is retried as an ordinary cache miss on the
// next refresh cycle. No story is lost, just deferred.
const MAX_NEW_ARTICLES_PER_REFRESH = Number(process.env.MAX_NEW_ARTICLES_PER_REFRESH || 5);

// A hard wall-clock deadline for how long a single refresh will wait on
// NEW generations, shared across every item in that refresh (not "N
// seconds per item"). Reused/cached articles never touch this deadline.
//
// This now runs inside app/api/cron/refresh/route.ts, which sets its own
// `maxDuration = 60` (Vercel Hobby's ceiling) dedicated entirely to this
// job — no page request shares this time budget anymore. Default below
// leaves ~15-18s of headroom inside that 60s ceiling for the RSS fetch
// (parallel across feeds, each individually capped at 15s) plus response
// overhead. If you raise GEMINI_MIN_MS_BETWEEN_CALLS in lib/ai.ts, raise
// this too — it should stay comfortably above that spacing value, not
// just barely over it, or every slot after the first gets discarded
// every cycle again.
const NEW_ARTICLE_TIME_BUDGET_MS = Number(process.env.NEW_ARTICLE_TIME_BUDGET_MS || 42000);

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

/** Rough reading time from summary length (~200 wpm) — derived at generation time, stored on the article. */
function estimateReadingTimeSeconds(paragraphs: string[]): number {
  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  const WORDS_PER_SECOND = 3.3;
  return Math.max(20, Math.round(words / WORDS_PER_SECOND));
}

/**
 * Ranks by importance first (exam significance, as judged by the AI),
 * recency second. A Budget announcement from yesterday outranks a
 * routine story from ten minutes ago.
 */
function rankArticles(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => {
    if (b.importanceScore !== a.importanceScore) return b.importanceScore - a.importanceScore;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

/**
 * Merges a fresh pipeline run into the previous snapshot so a thin cycle
 * (some feeds down, Gemini briefly slow) can only ever ADD to what's
 * already on the site, never shrink it. Fresh data always wins for a
 * story that appears in both (in case its ranking/classification
 * changed); a previously-snapshotted article that fresh RSS didn't see
 * this cycle is kept for STALE_GRACE_MS beyond its normal recency window
 * before it's dropped, so it fades out gradually across a few cycles
 * rather than disappearing the instant it's not in the latest RSS pull.
 */
function mergeArticles(previous: Article[], fresh: Article[]): Article[] {
  const byId = new Map<string, Article>();
  for (const a of previous) {
    if (isWithin(a.publishedAt, RECENCY_WINDOW_MS + STALE_GRACE_MS)) {
      byId.set(a.id, a);
    }
  }
  for (const a of fresh) {
    byId.set(a.id, a);
  }
  return rankArticles(Array.from(byId.values())).slice(0, MAX_SNAPSHOT_ARTICLES);
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
 * Bengali translation + exam-relevance judgment. Unchanged from before —
 * this part was never the problem; see the file-level comment above.
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

interface PipelineCounts {
  hit: number;
  generated: number;
  skippedBudget: number;
  skippedDeadline: number;
  failed: number;
  droppedLowValue: number;
}

interface PipelineResult {
  articles: Article[];
  feedResults: FeedResult[];
  counts: PipelineCounts;
}

/**
 * Runs the live RSS + AI pipeline exactly once and returns everything a
 * caller needs both to build a snapshot AND to diagnose the run (per-feed
 * results, generation counts). Throws in exactly one situation: every
 * single trusted RSS feed failed, meaning there is no source data at all
 * to build from. Never throws just because Gemini rate-limited or a
 * generation call failed — that's expected and handled per-item below.
 *
 * This is ONLY ever called from refreshArticles(), which in turn is ONLY
 * ever called from app/api/cron/refresh/route.ts — never from a page
 * request. See the file-level comment for why that separation is the
 * actual fix for the "only one article" problem.
 */
async function buildArticles(): Promise<PipelineResult> {
  console.log(`[briefly] running pipeline at ${new Date().toISOString()}`);

  const { items, feedResults } = await fetchAllTrustedFeeds();
  const okFeeds = feedResults.filter((f) => f.status === "ok").length;
  console.log(`[briefly:rss] ${okFeeds}/${feedResults.length} feed(s) ok, ${items.length} raw item(s) seen`);

  if (feedResults.length > 0 && okFeeds === 0) {
    throw new Error(
      `All ${feedResults.length} trusted RSS feeds failed on this pass: ` +
        feedResults.map((f) => `${f.name} — ${f.error}`).join("; ")
    );
  }

  // 1. Only ever consider genuinely current items.
  const recent = items.filter((i) => i.headline && i.sourceUrl && isWithin(i.publishedAt, RECENCY_WINDOW_MS));

  // 2. Dedupe by exact fingerprint, while separately counting how many
  //    distinct sources reported a near-identical headline — used both
  //    as the "trending" signal and as a safety net that can pull a
  //    story back in even if the AI scored it as low-importance.
  const uniqueByFingerprint = new Map<string, FeedItem>();
  const corroboratingSources = new Map<string, Set<string>>();

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

  const newArticleBudget = { count: 0 };
  const deadlineMs = Date.now() + NEW_ARTICLE_TIME_BUDGET_MS;
  const counts: PipelineCounts = { hit: 0, generated: 0, skippedBudget: 0, skippedDeadline: 0, failed: 0, droppedLowValue: 0 };

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
    `[briefly] pipeline run complete — ${articles.length}/${uniqueItems.length} article(s) produced ` +
      `(cache hits: ${counts.hit}, newly generated: ${counts.generated}, ` +
      `skipped — budget: ${counts.skippedBudget}, skipped — deadline: ${counts.skippedDeadline}, ` +
      `failed: ${counts.failed}, dropped — low exam-relevance: ${counts.droppedLowValue})`
  );

  return { articles, feedResults, counts };
}

// Per-process guard against overlapping refreshes — e.g. the external
// scheduler firing again before the previous run finished, or a manual
// trigger overlapping a scheduled one. Ensures at most one live pipeline
// run happens at a time per warm instance instead of doubling Gemini load.
let inFlightRefresh: Promise<RefreshResult> | null = null;

export interface RefreshResult {
  ok: boolean;
  reason?: string;
  articleCount: number;
  previousArticleCount: number;
  feedResults?: FeedResult[];
  counts?: PipelineCounts;
  durationMs: number;
  generatedAt?: string;
}

/**
 * Runs the pipeline once, then applies the "never replace with an empty
 * or partial result" rule before touching persistent storage:
 *
 *   - Pipeline throws (all RSS feeds down)         -> snapshot untouched
 *   - Pipeline resolves with 0 articles             -> snapshot untouched
 *   - Pipeline resolves with >=1 article            -> merged into the
 *     previous snapshot (mergeArticles) and written
 *
 * This is the ONLY function that ever calls buildArticles() or
 * writeSnapshot(). It's called from app/api/cron/refresh/route.ts on a
 * schedule, and never from a page request.
 */
export async function refreshArticles(): Promise<RefreshResult> {
  if (inFlightRefresh) {
    console.log("[briefly:cron] refresh already in progress on this instance — reusing in-flight result instead of starting another");
    return inFlightRefresh;
  }

  inFlightRefresh = (async (): Promise<RefreshResult> => {
    const start = Date.now();
    const previousSnapshot = await readSnapshot();
    const previousArticles = previousSnapshot?.articles ?? [];

    let built: PipelineResult;
    try {
      built = await buildArticles();
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[briefly:cron] refresh FAILED, keeping previous snapshot untouched: ${message}`);
      return {
        ok: false,
        reason: message,
        articleCount: previousArticles.length,
        previousArticleCount: previousArticles.length,
        durationMs: Date.now() - start
      };
    }

    if (built.articles.length === 0) {
      console.warn("[briefly:cron] pipeline produced 0 articles this cycle — keeping previous snapshot untouched");
      return {
        ok: false,
        reason: "Pipeline ran (RSS ok) but produced 0 articles this cycle — likely Gemini fully unavailable on a still-cold cache",
        articleCount: previousArticles.length,
        previousArticleCount: previousArticles.length,
        feedResults: built.feedResults,
        counts: built.counts,
        durationMs: Date.now() - start
      };
    }

    const merged = mergeArticles(previousArticles, built.articles);

    const snapshot: Snapshot = {
      articles: merged,
      generatedAt: new Date().toISOString(),
      feedResults: built.feedResults,
      counts: built.counts,
      refreshDurationMs: Date.now() - start
    };

    try {
      await writeSnapshot(snapshot);
    } catch (err) {
      // Persist failure (e.g. Redis misconfigured/down): the in-memory
      // layer inside lib/snapshot.ts still holds this instance's last
      // good read, but nothing durable was written. Surface it loudly —
      // this is exactly the kind of failure /api/debug/news should make
      // obvious.
      console.error(`[briefly:cron] failed to persist snapshot: ${(err as Error).message}`);
      return {
        ok: false,
        reason: `Pipeline succeeded but snapshot could not be persisted: ${(err as Error).message}`,
        articleCount: previousArticles.length,
        previousArticleCount: previousArticles.length,
        feedResults: built.feedResults,
        counts: built.counts,
        durationMs: Date.now() - start
      };
    }

    if (merged.length < MIN_DESIRED_ARTICLES) {
      console.warn(
        `[briefly:cron] snapshot written with only ${merged.length} article(s), below the ` +
          `${MIN_DESIRED_ARTICLES}-article target. Expected on early cycles (cold cache); check ` +
          `/api/debug/news if it stays low across several cycles.`
      );
    }

    console.log(
      `[briefly:cron] refresh OK — ${merged.length} article(s) in snapshot (was ${previousArticles.length}), ` +
        `took ${Date.now() - start}ms`
    );

    return {
      ok: true,
      articleCount: merged.length,
      previousArticleCount: previousArticles.length,
      feedResults: built.feedResults,
      counts: built.counts,
      durationMs: Date.now() - start,
      generatedAt: snapshot.generatedAt
    };
  })().finally(() => {
    inFlightRefresh = null;
  });

  return inFlightRefresh;
}

/**
 * The single source of truth for "what's on the site right now," for
 * every route — homepage, category pages, search, /rss.xml, sitemap.
 * Reads the last snapshot written by refreshArticles(); does NOT touch
 * RSS or Gemini. Same name and signature as before this refactor, so
 * nothing calling it needs to change.
 */
export async function getArticles(): Promise<Article[]> {
  const snapshot = await readSnapshot();
  return snapshot?.articles ?? [];
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
