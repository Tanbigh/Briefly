import { NextRequest, NextResponse } from "next/server";
import { getArticles, getArticlesByCategory, searchArticles } from "@/lib/data";

// Explicitly opt this route out of any static/CDN caching. It already
// becomes dynamic implicitly (it reads `request.url`), but that's an
// implementation detail of Next.js's heuristics — spelling it out here
// means it stays fresh even if the route's internals change later. The
// underlying article list still comes from the cached `getArticles()` in
// lib/data.ts, so this only controls whether *this route's response* is
// cached, not whether RSS/AI is re-run per request.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");
  const cursor = Number(searchParams.get("cursor") ?? "0");
  const limit = Math.min(Number(searchParams.get("limit") ?? "12"), 50);

  const all = q ? await searchArticles(q) : category ? await getArticlesByCategory(category) : await getArticles();

  const page = all.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < all.length ? cursor + limit : null;

  return NextResponse.json(
    { articles: page, nextCursor, total: all.length },
    { headers: { "Cache-Control": "no-store, must-revalidate" } }
  );
}
