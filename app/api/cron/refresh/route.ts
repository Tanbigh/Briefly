import { NextRequest, NextResponse } from "next/server";
import { refreshArticles } from "@/lib/data";

/**
 * REFERENCE FILE — compare against your actual app/api/cron/refresh/route.ts.
 *
 * This is not a confirmed fix. It's a known-correct implementation of the
 * contract that lib/data.ts already documents and depends on:
 *   - refreshArticles() is called from exactly here, nowhere else
 *   - this route owns a dedicated 60s budget (Vercel Hobby's ceiling),
 *     not shared with any page request
 *   - callers are authorized with `Authorization: Bearer <CRON_SECRET>`
 *   - the response body surfaces refreshArticles()'s full RefreshResult
 *     (ok/reason/counts/feedResults) so the calling GitHub Action's log
 *     tells you exactly what happened without needing Vercel's dashboard
 *
 * If your real file differs in any of these ways, that's very likely
 * where the pipeline is actually breaking:
 *   - Wrong/missing `export const maxDuration = 60` -> Vercel kills the
 *     function at the platform default (10s) before Gemini calls finish.
 *   - Wrong/missing `export const dynamic = "force-dynamic"` -> Next may
 *     try to statically evaluate this route at build time.
 *   - Auth check comparing to the wrong env var, or expecting the secret
 *     in a query param instead of the Authorization header (or vice
 *     versa) -> every call 401/403s before refreshArticles() ever runs.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby plan's ceiling — dedicated entirely to this job

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    console.error("[briefly:cron] CRON_SECRET is not set on this deployment — refusing all requests");
    return NextResponse.json({ ok: false, reason: "CRON_SECRET not configured on server" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expected}`) {
    console.warn("[briefly:cron] rejected request with missing/invalid Authorization header");
    return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshArticles();
    return NextResponse.json(result, { status: result.ok ? 200 : 200 });
    // Note: deliberately 200 even when result.ok === false. A "pipeline
    // ran but produced 0 new articles this cycle" is an expected, logged
    // outcome (see data.ts), not a transport-level failure — the calling
    // GitHub Action should only red-X on genuine errors (auth, timeout,
    // unhandled exception), which the catch block below still surfaces
    // as a non-2xx.
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[briefly:cron] unhandled error in refreshArticles(): ${message}`);
    return NextResponse.json({ ok: false, reason: message }, { status: 500 });
  }
}