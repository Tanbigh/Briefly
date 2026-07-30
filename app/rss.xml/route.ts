import { getArticles } from "@/lib/data";

// Same reasoning as app/article/[slug]/page.tsx and app/sitemap.ts: avoid a
// build-time RSS/Gemini call. Render on demand; getArticles() is already
// cached internally via unstable_cache.
export const dynamic = "force-dynamic";
export const revalidate = 300;
// See app/page.tsx for why this is raised.
export const maxDuration = 300;

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://briefly.news";
  const articles = (await getArticles()).slice(0, 30);

  const items = articles
    .map(
      (a) => `
    <item>
      <title><![CDATA[${a.headline}]]></title>
      <link>${base}/article/${a.slug}</link>
      <guid>${base}/article/${a.slug}</guid>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${a.takeaway}]]></description>
      <category>${a.category}</category>
    </item>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Briefly</title>
    <link>${base}</link>
    <description>AI-summarized bilingual news briefings in English and natural Bengali.</description>${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
