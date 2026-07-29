import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/data";
import { CATEGORY_LIST } from "@/lib/mock-data";

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
