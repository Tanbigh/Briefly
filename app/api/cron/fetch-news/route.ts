import { NextRequest, NextResponse } from "next/server";
import { runIngestPass } from "@/lib/ingest";

export const dynamic = "force-dynamic";

/**
 * Manual/admin trigger for the ingestion pipeline — NOT used for scheduling.
 * Scheduling is handled entirely by GitHub Actions (see
 * .github/workflows/fetch-news.yml), which runs `npm run fetch-news` as a
 * plain Node script every 10 minutes with no execution-time limit.
 *
 * This route exists only so you can kick off a run by hand (e.g. right
 * after deploying, or to debug a feed) via:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/cron/fetch-news
 *
 * Vercel's Hobby plan caps serverless function duration at 10 seconds, so
 * on a busy news day this route may time out before every new story is
 * processed — that's expected and fine, since GitHub Actions (unaffected
 * by that limit) is what keeps the site continuously up to date.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runIngestPass();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
