import { NextRequest, NextResponse } from "next/server";
import { runIngestPass } from "@/lib/ingest";

export const maxDuration = 120; // seconds — allow time for multiple AI calls per run
export const dynamic = "force-dynamic";

/**
 * Called on a schedule by Vercel Cron (see vercel.json) every few minutes.
 * Protect it with CRON_SECRET so it can't be triggered by outsiders.
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
