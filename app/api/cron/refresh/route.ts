import { NextResponse } from "next/server";
import { refreshArticles } from "@/lib/data";

/**
 * The ONLY route that runs the live RSS + AI pipeline. Every page (home,
 * category, article, search, /rss.xml, sitemap) just reads the snapshot
 * this route produces — see the top of lib/data.ts for the full reasoning.
 *
 * WHY THIS ISN'T A VERCEL-NATIVE CRON JOB ON HOBBY:
 * Vercel's built-in Cron Jobs are capped at once-per-day on the Hobby
 * plan — any more frequent schedule fails at deploy time. That's much too
 * slow for a news site. So this stays a plain authenticated API route,
 * and something OUTSIDE Vercel calls it every ~10 minutes instead — see
 * .github/workflows/refresh.yml, a free GitHub Actions scheduled
 * workflow. If this project ever moves to Vercel Pro, you can additionally
 * (or instead) register this same route in vercel.json's `crons` array
 * with an every-10-minute cron schedule — no code change needed, since Vercel's
 * own cron sends the same `Authorization: Bearer $CRON_SECRET` header
 * this route already checks for.
 */

export const dynamic = "force-dynamic";
// Vercel Hobby's maximum. This is dedicated entirely to this one job —
// no page request shares it — which is what actually fixes the
// "only one article" problem. See lib/data.ts's NEW_ARTICLE_TIME_BUDGET_MS.
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: an unset secret must never be silently treated as
    // "anyone may trigger this." Set CRON_SECRET in your environment —
    // any long random string works; GitHub Actions and (if used) Vercel
    // Cron both send it as a Bearer token.
    console.error("[briefly:cron] CRON_SECRET is not set — refusing all requests until it is configured");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await refreshArticles();

  // 200 = wrote a new/merged snapshot. 207 = pipeline ran but the
  // previous snapshot was intentionally left untouched (see
  // refreshArticles' "never replace with empty/partial" rule) — this is
  // an expected, non-alarming outcome, not a 500, but it's still useful
  // to distinguish from a clean success in logs/monitoring.
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
