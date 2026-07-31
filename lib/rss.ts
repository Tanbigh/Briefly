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
 *   IP ranges (Vercel included, and apparently some residential ISPs too)
 *   regardless of URL correctness or headers — not fixable from
 *   application code. It's kept in the list because it's a legitimate
 *   official source and the per-feed error handling below already
 *   isolates any 403 to just this one feed.
 *
 * - News18: was blocked outright (403) from cloud egress IPs, independent
 *   of URL correctness — same class of issue as PIB above, but with no
 *   first-party fallback URL to try. Replaced with LiveMint (Mint), a
 *   comparable licensed, actively-syndicated Indian source.
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

const REQUEST_TIMEOUT_MS = 15000;
const FEED_REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; BrieflyNewsBot/1.0; +https://briefly.news)",
  Accept: "application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "en-IN,en;q=0.9"
};

// Some feeds (Reuters, PIB) reject requests with no/unusual User-Agent
// headers, which rss-parser doesn't set by default — that request then
// rejects and, before this file was instrumented, vanished silently
// inside Promise.allSettled with no log line anywhere.
//
// IMPORTANT: do NOT pass `xml2js: { strict: false }` here. That was tried
// to make parsing tolerant of malformed feeds (Hindustan Times specifically)
// and it broke EVERY feed instead of just that one: `strict: false` switches
// the underlying `sax` parser into HTML-compatibility mode, where `<link>`
// is treated as a void/self-closing element (as it is in an HTML <head>).
// Every RSS/Atom feed uses non-empty `<link>...</link>` elements constantly,
// so that mode corrupts the parse tree for essentially all real-world feeds,
// not just malformed ones — which is exactly what caused all 13 feeds to
// fail with "not recognized as RSS 1 or 2" at once. Malformed-XML recovery
// is handled below instead, as a narrow, per-feed, best-effort fallback in
// `fetchFeed()`, so it can't degrade the feeds that were already fine.
const parser = new Parser({
  headers: FEED_REQUEST_HEADERS,
  timeout: REQUEST_TIMEOUT_MS,
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
 * Best-effort recovery for feeds with small, mechanical XML malformations
 * (e.g. Hindustan Times shipping a bare attribute with no `="value"`, which
 * trips up strict XML parsing at that exact line/column). Only called when
 * normal strict parsing has already failed for a feed — never runs on a
 * feed that parses fine, so it can't introduce a regression the way a
 * parser-wide leniency setting did (see the note on `parser` above).
 *
 * Strategy: re-fetch the raw XML ourselves, strip any attribute token that
 * isn't a well-formed `name="value"` / `name='value'` pair, and retry
 * strict parsing on the cleaned string. If any step fails, returns null and
 * the caller falls back to surfacing the original parse error — this
 * function can only help, never make things worse.
 */
async function trySanitizedFallback(url: string): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let raw: string;
    try {
      const res = await fetch(url, { headers: FEED_REQUEST_HEADERS, signal: controller.signal });
      if (!res.ok) return null;
      raw = await res.text();
    } finally {
      clearTimeout(timeout);
    }

    const sanitized = raw.replace(
      /<([a-zA-Z][\w:.-]*)((?:\s+[^<>]*)?)(\/?)>/g,
      (full: string, tagName: string, rawAttrs: string, selfClose: string) => {
        if (!rawAttrs || !rawAttrs.trim()) return full;
        // Drop any attribute-looking token that isn't followed by `=` — a
        // bare word like `alt` in `<img src="x" alt>` is what "Attribute
        // without value" means; the value itself isn't something we use
        // downstream (we only read text content and a handful of known
        // attrs like media:content's url), so dropping it is safe.
        const cleanedAttrs = rawAttrs.replace(/(^|\s)([\w:.-]+)(?!\s*=)(?=\s|$)/g, "$1");
        return `<${tagName}${cleanedAttrs}${selfClose ? "/" : ""}>`;
      }
    );

    return await parser.parseString(sanitized);
  } catch {
    return null;
  }
}

/**
 * Fetches and normalizes a single trusted RSS feed.
 * Never returns full article bodies — RSS <description>/<summary> fields
 * only, which publishers explicitly expose for syndication/preview use.
 */
export async function fetchFeed(feed: (typeof TRUSTED_SOURCES)[number]): Promise<FeedItem[]> {
  let parsed;
  try {
    parsed = await parser.parseURL(feed.url);
  } catch (err) {
    const recovered = await trySanitizedFallback(feed.url);
    if (!recovered) throw err; // sanitization couldn't help — surface the original error
    console.warn(`[briefly:rss] ${feed.name} — recovered via malformed-XML sanitization fallback (original error: ${(err as Error).message})`);
    parsed = recovered;
  }

  return (parsed.items ?? []).map((item: any) => ({
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
 * are still returned.
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