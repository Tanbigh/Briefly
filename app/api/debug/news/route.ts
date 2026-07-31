import { NextResponse } from "next/server";
import { readSnapshot } from "@/lib/snapshot";

/**
 * Human-facing health check: "is the site actually fresh, and if not,
 * which feed is the problem and why." Reads the persisted snapshot only
 * — never touches RSS or Gemini, so checking this never itself burns
 * request budget or Gemini quota.
 *
 * Optionally gated by DEBUG_SECRET (?key=...) if you set that env var.
 * If it's unset, this endpoint is open — it only exposes feed health and
 * article counts, nothing sensitive — but set DEBUG_SECRET if you'd
 * rather keep it private.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const debugSecret = process.env.DEBUG_SECRET;
  if (debugSecret) {
    const key = new URL(request.url).searchParams.get("key");
    if (key !== debugSecret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const snapshot = await readSnapshot();

  if (!snapshot) {
    return NextResponse.json({
      ok: false,
      status: "no snapshot yet",
      hint:
        "Either /api/cron/refresh has never completed successfully, or Redis isn't " +
        "configured (check UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Try " +
        "triggering /api/cron/refresh manually with your CRON_SECRET."
    });
  }

  const ageMs = Date.now() - new Date(snapshot.generatedAt).getTime();
  const feedsOk = snapshot.feedResults.filter((f) => f.status === "ok");
  const feedsFailing = snapshot.feedResults.filter((f) => f.status === "error");

  return NextResponse.json({
    ok: true,
    lastRefreshAt: snapshot.generatedAt,
    lastRefreshAgeMinutes: Math.round(ageMs / 60000),
    lastRefreshDurationMs: snapshot.refreshDurationMs,
    articleCount: snapshot.articles.length,
    generationCounts: snapshot.counts,
    feeds: {
      okCount: feedsOk.length,
      failingCount: feedsFailing.length,
      total: snapshot.feedResults.length,
      details: snapshot.feedResults.map((f) => ({
        name: f.name,
        status: f.status,
        itemCount: f.itemCount,
        newestItemAt: f.newestItemAt,
        durationMs: f.durationMs,
        error: f.error
      }))
    }
  });
}
