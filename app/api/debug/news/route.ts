import { NextRequest, NextResponse } from "next/server";
import { fetchAllTrustedFeeds } from "@/lib/rss";
import { getArticles } from "@/lib/data";

export const dynamic = "force-dynamic";
// See app/page.tsx for why this is raised.
export const maxDuration = 300;

/**
 * Diagnostics for the no-database, RSS -> AI -> cache pipeline.
 *
 * There's no IngestLog table and no DB to query anymore — everything
 * this route reports comes from the same two things every page uses:
 * the cached article list (`getArticles()`) and, optionally, a live
 * read-only RSS pull. That means this endpoint can never drift from
 * what readers are actually seeing.
 *
 * Usage:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/debug/news
 *   curl -H "Authorization: Bearer $CRON_SECRET" "https://your-site/api/debug/news?live=true"
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wantsLiveCheck = new URL(request.url).searchParams.get("live") === "true";
  const response: Record<string, unknown> = { ok: true, checkedAt: new Date().toISOString() };

  try {
    const articles = await getArticles();
    const newest = articles[0]?.publishedAt ?? null;
    response.cachedArticles = {
      total: articles.length,
      newestPublishedAt: newest,
      hoursSinceNewest: newest ? Number(((Date.now() - new Date(newest).getTime()) / 3_600_000).toFixed(1)) : null,
      breakingCount: articles.filter((a) => a.isBreaking).length,
      trendingCount: articles.filter((a) => a.isTrending).length,
      sample: articles.slice(0, 5).map((a) => ({
        slug: a.slug,
        headline: a.headline,
        source: a.source,
        publishedAt: a.publishedAt,
        isBreaking: a.isBreaking,
        isTrending: a.isTrending
      }))
    };
  } catch (err) {
    response.ok = false;
    response.cachedArticles = { error: (err as Error).message };
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
      "Not requested — add ?live=true to fetch every trusted feed right now, read-only, no cache writes.";
  }

  return NextResponse.json(response, { headers: { "Cache-Control": "no-store, must-revalidate" } });
}
