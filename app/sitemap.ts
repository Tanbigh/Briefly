import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/data";
import { CATEGORY_LIST } from "@/lib/site-data";

// Same reasoning as app/article/[slug]/page.tsx: this is a database-free,
// RSS-driven site, and Next.js would otherwise try to statically generate
// this route at `next build` time — before the build has network access to
// RSS/the Gemini API in most CI/deploy setups, and before any of today's
// articles exist. Render it on demand instead.
//
// See app/page.tsx for why `fetchCache = "force-no-store"` is required
// alongside `dynamic = "force-dynamic"` — without it, getArticles()'s
// underlying Redis read (fetch-based, via @upstash/redis) gets served
// from Next's Data Cache indefinitely, independent of how often this
// route itself re-renders.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// See app/page.tsx for why this is raised.
export const maxDuration = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://briefly.news";
  const articles = await getArticles();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "always", priority: 1 },
    { url: `${base}/weather`, changeFrequency: "hourly", priority: 0.6 },
    ...CATEGORY_LIST.map((c) => ({
      url: `${base}/category/${encodeURIComponent(c)}`,
      changeFrequency: "hourly" as const,
      priority: 0.7
    }))
  ];

  const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${base}/article/${a.slug}`,
    lastModified: a.publishedAt,
    changeFrequency: "never",
    priority: 0.5
  }));

  return [...staticRoutes, ...articleRoutes];
}