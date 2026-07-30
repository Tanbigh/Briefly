import Parser from "rss-parser";

/**
 * Registry of trusted, licensing-compliant sources.
 * Only add feeds here that permit RSS syndication under their terms of use.
 * Do not add scraped sources that disallow it in robots.txt or ToS.
 *
 * NOTES ON SOURCES DELIBERATELY LEFT OUT OR CHANGED:
 *
 * - Reuters: reuters.com killed its consumer RSS feeds in 2020. The URL
 *   that used to live here (reutersagency.com/feed/?best-topics=world) was
 *   itself a replacement from back then, and it has now ALSO been retired —
 *   Reuters moved that agency-facing feed to reutersbest.com sometime in
 *   2026. That's why this feed had been silently failing every run: the
 *   domain migration, not a code bug. Fixed below to the current URL.
 *
 * - AP News (Associated Press): AP does not currently offer any public RSS
 *   feed for apnews.com — they discontinued it and only third-party
 *   scrapers/proxies exist. Per this file's own rule (no scraped sources),
 *   AP is intentionally NOT included. If AP relaunches an official feed,
 *   add it here.
 *
 * - Anandabazar Patrika (anandabazar.com): no public RSS feed could be
 *   found for ABP's Bengali edition. Scraping their site would violate the
 *   "no scraped sources" rule above, so it's excluded. BBC Bangla is used
 *   instead as the Bengali-language source — it's a legitimate, licensed
 *   RSS feed and covers West Bengal/India-relevant Bengali news.
 *
 * - Indian Express: the old `/print/front-page/feed/` URL now resolves to
 *   something that isn't valid RSS 1/2 anymore ("Feed not recognized"),
 *   almost certainly retired/redirected along with a CMS change. Their
 *   current, actively-syndicated master feed is `indianexpress.com/feed/`
 *   — swapped in below.
 *
 * - PIB India: was pointed at `pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3`.
 *   Two separate problems there: (1) `Regid=3` is PIB's *Kolkata regional
 *   office* feed, not the all-India Press Releases feed — that's
 *   `Regid=1` (confirmed against PIB's own /ViewRss.aspx listing page).
 *   Fixed to `Regid=1` and to the `www.` host, which is what that listing
 *   page itself links to. (2) Separately, pib.gov.in sits behind a
 *   government WAF that intermittently 403s requests from datacenter/cloud
 *   IP ranges (Vercel included) regardless of URL correctness or headers —
 *   this is not something fixable from application code. It's kept in the
 *   list because it's a legitimate official source and the per-feed error
 *   handling below already isolates any 403 to just this one feed; if it's
 *   consistently blocked from your deployment region, that's expected
 *   platform-level blocking, not a bug here.
 *
 * - News18: was blocked outright (403) from this deployment's egress IPs,
 *   independent of URL correctness — same class of issue as PIB above, but
 *   with no first-party fallback URL to try. Replaced with LiveMint (Mint),
 *   a comparable licensed, actively-maintained Indian business/general news
 *   RSS feed, as a working like-for-like substitute.
 */
export const TRUSTED_SOURCES = [
  { name: "Reuters World News", url: "https://reutersbest.com/region/global/feed/", source: "Reuters" },
  { name: "BBC News", url: "http://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC" },
  { name: "BBC India", url: "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml", source: "BBC" },
  { name: "BBC Bangla", url: "https://feeds.bbci.co.uk/bengali/rss.xml", source: "BBC Bangla" },
  { name: "PIB India", url: "https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1", source: "PIB" },
  { name: "The Hindu", url: "https://www.thehindu.com/feeder/default.rss", source: "The Hindu" },
  { name: "Indian Express", url: "https://indianexpress.com/feed/", source: "Indian Express" },
  { name: "NDTV", url: "https://feeds.feedburner.com/ndtvnews-top-stories", source: "NDTV" },
  { name: "Hindustan Times", url: "https://www.hindustantimes.com/rss/topnews/rssfeed.xml", source: "Hindustan Times" },
  { name: "Times of India", url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", source: "Times of India" },
  { name: "LiveMint", url: "https://www.livemint.com/rss/news", source: "LiveMint" },
  { name: "Google News - India", url: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en", source: "Google News" },
  { name: "Google News - World", url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", source: "Google News" }
];

// Some feeds (Reuters, PIB) reject requests with no/unusual User-Agent
// headers, which rss-parser doesn't set by default — that request then
// rejects and, before this file was instrumented, vanished silently
// inside Promise.allSettled with no log line anywhere. The fuller set of
// browser-like headers below (Accept/Accept-Language, not just
// User-Agent) reduces — but, per the notes above, can't fully eliminate —
// bot-detection 403s from sites that specifically block datacenter IP
// ranges rather than inspecting headers.
//
// `xml2js: { strict: false }` makes the underlying XML parser tolerant of
// minor malformed markup (e.g. an attribute without a value, which is
// what was breaking Hindustan Times's feed at a specific line/column).
// Strict mode throws on the first such deviation and aborts that feed
// entirely; non-strict mode recovers and still extracts the items.
const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; BrieflyNewsBot/1.0; +https://briefly.news)",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-IN,en;q=0.9"
  },
  timeout: 15000,
  xml2js: {
    strict: false,
    trim: true
  },
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
  /** ISO timestamp of the newest item this feed returned, or null if empty/errored.
   *  This is what answers "is the feed actually returning fresh news" — a feed can
   *  report status "ok" with items but still be stale (e.g. serving a cached/old
   *  snapshot), so itemCount alone doesn't prove freshness. */
  newestItemAt?: string | null;
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
 * items and a per-feed breakdown of what happened. This uses Promise.all
 * with an internal try/catch per feed (not Promise.allSettled) so that a
 * feed that fails — dead URL, blocked User-Agent/IP, timeout, changed XML
 * shape, malformed markup — never rejects the outer Promise.all and never
 * throws out of this function. It's simply recorded as `status: "error"`
 * in `feedResults` and contributes zero items; every other feed's items
 * are still returned. This was already true before this change; what's
 * new is that fewer feeds actually need to hit this path now (see the
 * TRUSTED_SOURCES notes above), and the ones still likely to occasionally
 * (PIB, and any future WAF-protected source) no longer take the whole
 * rebuild down with them — same as always, just documented explicitly
 * here since it's the mechanism this file is being asked to guarantee.
 */
export async function fetchAllTrustedFeeds(): Promise<{ items: FeedItem[]; feedResults: FeedResult[] }> {
  const feedResults: FeedResult[] = [];
  const items: FeedItem[] = [];

  console.log(`[briefly:rss] starting fetch of ${TRUSTED_SOURCES.length} feed(s): ${TRUSTED_SOURCES.map((f) => f.name).join(", ")}`);

  await Promise.all(
    TRUSTED_SOURCES.map(async (feed) => {
      const start = Date.now();
      try {
        const feedItems = await fetchFeed(feed);
        items.push(...feedItems);

        const newestItemAt = feedItems.length
          ? feedItems
              .map((i) => new Date(i.publishedAt).getTime())
              .reduce((max, t) => (t > max ? t : max), 0)
          : null;
        const newestItemIso = newestItemAt ? new Date(newestItemAt).toISOString() : null;
        const ageHours = newestItemAt ? ((Date.now() - newestItemAt) / 3_600_000).toFixed(1) : null;

        feedResults.push({
          name: feed.name,
          url: feed.url,
          status: "ok",
          itemCount: feedItems.length,
          durationMs: Date.now() - start,
          newestItemAt: newestItemIso
        });

        // A feed can return HTTP 200 with a full item list that is nonetheless
        // stale (cached CDN response, dead-but-still-serving endpoint, etc).
        // Flagging that here — rather than only counting itemCount — is what
        // makes "feed says OK but news isn't actually fresh" diagnosable.
        if (feedItems.length === 0) {
          console.warn(`[briefly:rss] ${feed.name} — OK but returned 0 items (${Date.now() - start}ms)`);
        } else if (newestItemAt && Date.now() - newestItemAt > 24 * 3_600_000) {
          console.warn(
            `[briefly:rss] ${feed.name} — OK, ${feedItems.length} item(s), but newest item is ${ageHours}h old ` +
              `(newestItemAt=${newestItemIso}). Feed may be stale/cached rather than actually failing.`
          );
        } else {
          console.log(
            `[briefly:rss] ${feed.name} — ok, ${feedItems.length} item(s) in ${Date.now() - start}ms, ` +
              `newest item ${ageHours}h old`
          );
        }
      } catch (err) {
        const message = (err as Error).message;
        feedResults.push({
          name: feed.name,
          url: feed.url,
          status: "error",
          itemCount: 0,
          error: message,
          durationMs: Date.now() - start,
          newestItemAt: null
        });
        console.error(`[briefly:rss] ${feed.name} (${feed.url}) — FAILED after ${Date.now() - start}ms: ${message}`);
      }
    })
  );

  const okCount = feedResults.filter((f) => f.status === "ok").length;
  console.log(
    `[briefly:rss] done — ${okCount}/${feedResults.length} feed(s) ok, ${items.length} raw item(s) total`
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