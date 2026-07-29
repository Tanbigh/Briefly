import { NextRequest, NextResponse } from "next/server";
import { getArticles, getArticlesByCategory, searchArticles } from "@/lib/data";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");
  const cursor = Number(searchParams.get("cursor") ?? "0");
  const limit = Math.min(Number(searchParams.get("limit") ?? "12"), 50);

  const all = q ? await searchArticles(q) : category ? await getArticlesByCategory(category) : await getArticles();

  const page = all.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < all.length ? cursor + limit : null;

  return NextResponse.json({ articles: page, nextCursor, total: all.length });
}
