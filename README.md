# Briefly

An AI-powered bilingual (English / Bengali) news briefing platform. Briefly reads
headlines and short descriptions from trusted RSS feeds, generates a short AI
summary in English, rewrites it as natural Bengali newspaper prose, and publishes
it automatically — no manual posting, no translation, and **no database**.

## Stack (intentionally minimal)

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** — no component library, no CSS-in-JS
- **rss-parser** for feed ingestion
- **Anthropic Claude API** for summarization, Bengali rewriting, and categorization
- **Next.js Data Cache** (`unstable_cache`) — the *only* persistence layer

No database, no ORM, no cron service, no GitHub Actions workflow. Nothing to
provision, seed, or migrate.

## How it works

```
RSS feeds → fetch latest items → dedupe → AI summary + Bengali translation
          → Next.js Data Cache (10 min TTL) → homepage / category / search / RSS / sitemap
```

All of this lives in `lib/data.ts`. `getArticles()` is the single source of
truth every route calls:

- It's wrapped in `unstable_cache` with a 10-minute revalidation window, so
  the site refreshes itself automatically — no cron job, no manual trigger,
  nothing to "run." The first request after the window expires triggers a
  fresh RSS + AI pass in the background; everyone else keeps getting the
  last good list until that finishes (standard stale-while-revalidate).
- Each individual article's AI generation is cached *separately*, keyed by a
  fingerprint of its source + headline, for 3 days. A story still sitting in
  the RSS feed an hour from now reuses its already-generated summary and
  translation instead of paying for a fresh Anthropic call every cycle.
- "Trending" is derived, not stored: a story reported by 2+ distinct trusted
  sources (matched by normalized headline) is treated as trending. This is
  an approximation (exact-phrase matching only) — there's no database of
  clicks/views to rank on instead.
- If every RSS feed fails, or every item fails AI generation, `getArticles()`
  **throws**. There is no mock-data fallback anywhere in this codebase, in
  any environment — a broken pipeline shows a visible error, never demo
  content standing in for real news.

## Project structure

```
app/                    Routes (App Router)
  page.tsx              Homepage
  article/[slug]/       Full bilingual article view (on-demand ISR, no build-time crawl)
  category/[category]/  Category listing
  weather/, search/      Weather (static placeholder) + search pages
  api/articles/          Read API (JSON)
  api/debug/news/        Diagnostics: cached article stats + optional live feed check
components/             Small, single-purpose React components
lib/
  ai.ts                 All Claude API calls (summarize, rewrite, categorize)
  rss.ts                Trusted-source registry + feed parsing
  data.ts               RSS -> AI -> cache pipeline (replaces the old DB read/write layer)
  site-data.ts          Static config: category list + placeholder weather content
```

## Local setup

```bash
npm install
cp .env.example .env      # fill in ANTHROPIC_API_KEY
npm run dev
```

There is nothing else to configure locally — no database to provision, no
`db:push`, no seed script. The first page load fetches RSS and generates AI
content live; every request after that (for 10 minutes) is served from cache.

## Deploying (Vercel Hobby plan)

1. Push this repo to GitHub.
2. Import it into Vercel — the Hobby (free) plan is sufficient.
3. Add `ANTHROPIC_API_KEY` and `NEXT_PUBLIC_SITE_URL` as environment
   variables in Vercel's project settings.
4. Deploy.

That's it. No Postgres, no `DATABASE_URL`, no GitHub Actions secrets, no
cron configuration. `vercel.json` is intentionally empty — there is no
scheduled job to configure; Next.js's own cache revalidation is the
refresh mechanism.

## Troubleshooting: "the site isn't showing new articles"

1. **Hit `/api/debug/news`** (add `-H "Authorization: Bearer $CRON_SECRET"`
   if `CRON_SECRET` is set): it reports the cached article count, the
   newest article's timestamp, and how many are flagged breaking/trending.
   Add `?live=true` to also fetch every trusted RSS feed right now,
   read-only, so you can see immediately whether the sources themselves
   are returning fresh items.
2. **Check `ANTHROPIC_API_KEY`** is set in your deployment environment —
   without it, RSS items can be fetched but every article's AI generation
   step fails, and if *all* of them fail, `getArticles()` throws rather
   than showing anything.
3. **Cache window** — the article list refreshes at most every 10 minutes
   (`ARTICLE_LIST_REVALIDATE_SECONDS` in `lib/data.ts`). If you just
   deployed, the very first request populates the cache; that first
   request will be slower (it's doing a live RSS + AI pass), everything
   after is fast.
4. **A visible error page instead of stale content** is expected behavior,
   not a bug, if every RSS feed is down or every AI generation call fails —
   see the console/function logs for exactly which feeds or calls failed.

## Copyright approach

The pipeline never stores or displays full article text. It only ever sends
the model a headline and the short public description/dek a publisher exposes
in its own RSS feed for syndication — the same fields any news reader app
would use. Every article links back to the original source with a
"Read Original Article" button.
