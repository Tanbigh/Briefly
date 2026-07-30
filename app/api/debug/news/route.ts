import { NextRequest, NextResponse } from "next/server";
import { fetchAllTrustedFeeds } from "@/lib/rss";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY DEBUG ENDPOINT — remove or keep behind CRON_SECRET once the
 * pipeline is confirmed healthy again.
 *
 * Answers, in one call, every question needed to find where "today's
 * news" is getting lost between the RSS feeds and the homepage:
 *
 *   - Is the DB reachable, and how many articles does it actually hold?
 *   - What are the 10 newest articles, and how old is the newest one?
 *   - What happened on each of the last 20 ingest runs — items seen,
 *     inserted, skipped (broken down by *why* they were skipped), and
 *     any errors — including per-feed fetch failures, which previously
 *     never made it into any log at all?
 *   - (optional, ?live=true) Fetch every trusted RSS feed right now,
 *     read-only, no DB writes, so you can see immediately whether the
 *     sources themselves are returning fresh items.
 *
 * Usage:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/debug/news
 *   curl -H "Authorization: Bearer $CRON_SECRET" "https://your-site/api/debug/news?live=true"
 *
 * Same auth pattern as /api/cron/fetch-news: if CRON_SECRET is set, it's
 * required. `?live=true` does a real network fetch of every feed, which
 * can be slow — Vercel Hobby caps a single request at 10s, so prefer
 * running that check with `npm run fetch-news` locally, or without
 * `?live=true` here, if it times out.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wantsLiveCheck = new URL(request.url).searchParams.get("live") === "true";
  const response: Record<string, unknown> = { ok: true, checkedAt: new Date().toISOString() };

  if (!process.env.DATABASE_URL) {
    response.ok = false;
    response.database = {
      connected: false,
      error: "DATABASE_URL is not set in this environment — the site is rendering from lib/mock-data.ts, not the database."
    };
  } else {
    try {
      const { prisma } = await import("@/lib/db");

      const [totalArticles, latestArticles, recentIngestRuns] = await Promise.all([
        prisma.article.count(),
        prisma.article.findMany({
          orderBy: { publishedAt: "desc" },
          take: 10,
          select: {
            id: true,
            slug: true,
            headline: true,
            source: true,
            publishedAt: true,
            isBreaking: true,
            isTrending: true,
            createdAt: true
          }
        }),
        prisma.ingestLog.findMany({
          orderBy: { ranAt: "desc" },
          take: 20
        })
      ]);

      const newestArticlePublishedAt = latestArticles[0]?.publishedAt ?? null;
      const hoursSinceNewestArticle = newestArticlePublishedAt
        ? Number(((Date.now() - new Date(newestArticlePublishedAt).getTime()) / 3_600_000).toFixed(1))
        : null;

      response.database = {
        connected: true,
        totalArticles,
        newestArticlePublishedAt,
        hoursSinceNewestArticle,
        latestArticles
      };
      response.recentIngestRuns = recentIngestRuns;

      if (recentIngestRuns.length === 0) {
        response.warning =
          "No IngestLog rows exist yet — the ingest pipeline (GitHub Actions / npm run fetch-news) has never completed a run against this database.";
      } else {
        const zeroNewStreak = [];
        for (const run of recentIngestRuns) {
          if (run.itemsNew > 0) break;
          zeroNewStreak.push(run);
        }
        if (zeroNewStreak.length === recentIngestRuns.length) {
          response.warning = `The last ${recentIngestRuns.length} ingest run(s) all inserted 0 new articles — check "details" on those rows for per-feed errors and skip-reason breakdowns.`;
        }
      }
    } catch (err) {
      response.ok = false;
      response.database = { connected: false, error: (err as Error).message };
    }
  }

  if (wantsLiveCheck) {
    try {
      const { items, feedResults } = await fetchAllTrustedFeeds();
      response.liveFeedCheck = {
        requestedAt: new Date().toISOString(),
        totalItemsFetched: items.length,
        feedResults
      };
    } catch (err) {
      response.liveFeedCheck = { error: (err as Error).message };
    }
  } else {
    response.liveFeedCheck =
      "Not requested — add ?live=true to fetch every trusted RSS feed right now (read-only, no DB writes).";
  }

  return NextResponse.json(response, { headers: { "Cache-Control": "no-store, must-revalidate" } });
}
