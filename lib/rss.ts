import Parser from "rss-parser";

/**
 * Registry of trusted, licensing-compliant sources.
 * Only add feeds here that permit RSS syndication under their terms of use.
 * Do not add scraped sources that disallow it in robots.txt or ToS.
 */
export const TRUSTED_SOURCES = [
  { name: "Reuters World News", url: "https://www.reutersagency.com/feed/?best-topics=world", source: "Reuters" },
  { name: "BBC News", url: "http://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC" },
  { name: "BBC India", url: "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml", source: "BBC" },
  { name: "PIB India", url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3", source: "PIB" },
  { name: "Google News - India", url: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en", source: "Google News" },
  { name: "Google News - World", url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", source: "Google News" }
];

// Some feeds (Reuters, PIB) reject requests with no/unusual User-Agent
// headers, which rss-parser doesn't set by default — that request then
// rejects and, before this file was instrumented, vanished silently
// inside Promise.allSettled with no log line anywhere.
const parser = new Parser({
  headers: { "User-Agent": "Mozilla/5.0 (compatible; BrieflyNewsBot/1.0; +https://briefly.news)" },
  timeout: 15000,
  customFields: {
    item: [["media:content", "media"], ["media:thumbnail", "thumbnail"]]
  }
});

export interface FeedItem {
  headline: string;
  description: string;
  sourceUrl: string;
  source: string;
  publishedAt: string;
  imageUrl: string | null;
}

/** Per-feed outcome, used for logging and the /api/debug/news endpoint. */
export interface FeedResult {
  name: string;
  url: string;
  status: "ok" | "error";
  itemCount: number;
  error?: string;
  durationMs: number;
}

/**
 * Fetches and normalizes a single trusted RSS feed.
 * Never returns full article bodies — RSS <description>/<summary> fields
 * only, which publishers explicitly expose for syndication/preview use.
 */
export async function fetchFeed(feed: (typeof TRUSTED_SOURCES)[number]): Promise<FeedItem[]> {
  const parsed = await parser.parseURL(feed.url);

  return (parsed.items ?? []).map((item) => ({
    headline: item.title ?? "",
    description: stripHtml(item.contentSnippet ?? item.content ?? item.summary ?? ""),
    sourceUrl: item.link ?? "",
    source: feed.source,
    publishedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
    imageUrl: extractImage(item)
  }));
}

/**
 * Fetches every trusted feed in parallel and returns BOTH the combined
 * items and a per-feed breakdown of what happened. Previously this used
 * Promise.allSettled and threw away the "rejected" half entirely — a feed
 * that started failing (dead URL, blocked User-Agent, timeout, changed
 * XML shape) would just quietly stop contributing items forever, with
 * nothing in any log to say so. That's now impossible: every feed
 * failure is captured, logged, and surfaced to the ingest summary and
 * IngestLog row.
 */
export async function fetchAllTrustedFeeds(): Promise<{ items: FeedItem[]; feedResults: FeedResult[] }> {
  const feedResults: FeedResult[] = [];
  const items: FeedItem[] = [];

  await Promise.all(
    TRUSTED_SOURCES.map(async (feed) => {
      const start = Date.now();
      try {
        const feedItems = await fetchFeed(feed);
        items.push(...feedItems);
        feedResults.push({
          name: feed.name,
          url: feed.url,
          status: "ok",
          itemCount: feedItems.length,
          durationMs: Date.now() - start
        });
        console.log(`[briefly] feed ok — ${feed.name}: ${feedItems.length} item(s) in ${Date.now() - start}ms`);
      } catch (err) {
        const message = (err as Error).message;
        feedResults.push({
          name: feed.name,
          url: feed.url,
          status: "error",
          itemCount: 0,
          error: message,
          durationMs: Date.now() - start
        });
        console.error(`[briefly] feed FAILED — ${feed.name} (${feed.url}): ${message}`);
      }
    })
  );

  return { items, feedResults };
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImage(item: any): string | null {
  if (item.media?.$?.url) return item.media.$.url;
  if (item.thumbnail?.$?.url) return item.thumbnail.$.url;
  const match = /<img[^>]+src="([^">]+)"/.exec(item.content ?? "");
  return match ? match[1] : null;
}
