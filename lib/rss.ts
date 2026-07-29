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

const parser = new Parser({
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

export async function fetchAllTrustedFeeds(): Promise<FeedItem[]> {
  const results = await Promise.allSettled(TRUSTED_SOURCES.map(fetchFeed));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
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
