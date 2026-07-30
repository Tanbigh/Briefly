# Briefly

An AI-powered bilingual (English / Bengali) news briefing platform. Briefly reads
headlines and short descriptions from trusted RSS feeds, generates a short AI
summary in English, rewrites it as natural Bengali newspaper prose, and publishes
it automatically — no manual posting or translation required.

## Stack (intentionally minimal)

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** — no component library, no CSS-in-JS
- **PostgreSQL** via **Prisma** (thin, typed data layer — no raw SQL scattered around)
- **rss-parser** for feed ingestion
- **Anthropic Claude API** for summarization, Bengali rewriting, and categorization

No animation libraries, state-management libraries, or UI kits are used. Motion is
plain CSS/Tailwind transitions only.

## Project structure

```
app/                    Routes (App Router)
  page.tsx              Homepage
  article/[slug]/       Full bilingual article view
  category/[category]/  Category listing
  weather/, search/      Weather + search pages
  api/articles/          Read API (JSON)
  api/cron/fetch-news/   Ingestion pipeline entrypoint (cron-triggered)
components/             Small, single-purpose React components
lib/
  ai.ts                 All Claude API calls (summarize, rewrite, categorize, dedupe)
  rss.ts                Trusted-source registry + feed parsing
  ingest.ts             Ties RSS -> AI -> Postgres together
  data.ts               Read layer (DB, falls back to mock data if no DATABASE_URL)
  mock-data.ts          Sample bilingual articles for local preview
prisma/schema.prisma    Database schema
scripts/fetch-news.ts   CLI entrypoint for manual/GitHub Actions runs
```

## Local setup

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL and ANTHROPIC_API_KEY
npm run db:push           # creates tables from prisma/schema.prisma
npm run dev
```

Without `DATABASE_URL` set, the site still runs and renders using the bundled
sample articles in `lib/mock-data.ts`, so you can preview the design immediately.

## Running the news pipeline

Once `DATABASE_URL` and `ANTHROPIC_API_KEY` are set:

```bash
npm run fetch-news
```

This pulls every feed in `lib/rss.ts`, skips anything already published or that
looks like a duplicate of an existing story, and asks Claude to generate a
bilingual article for everything new.

## Keeping it running automatically

**GitHub Actions is the only scheduler** — `.github/workflows/fetch-news.yml`
runs `npm run fetch-news` every 10 minutes.

Vercel Cron is deliberately not used: it's a Vercel Pro feature, and the free
Hobby plan only allows cron jobs to run once a day, which isn't frequent
enough for a live news feed. Running the scheduler in GitHub Actions instead
means:

- It works on the Vercel Hobby plan with no restrictions.
- It's not bound by Vercel's serverless function duration limits (Hobby caps
  a single function invocation at 10 seconds — not enough time to summarize
  and translate several new stories in one pass).

To enable it:

1. Push this repo to GitHub.
2. In the repo's **Settings → Secrets and variables → Actions**, add
   `DATABASE_URL` and `ANTHROPIC_API_KEY` as repository secrets.
3. That's it — the workflow starts running every 10 minutes automatically.
   You can also trigger it manually from the **Actions** tab
   (`workflow_dispatch`) to do an initial fetch right after deploying.

There's also a small `/api/cron/fetch-news` route in the app itself, but
it's only there for manual/admin use (e.g. `curl` it once after deploying to
seed the database) — it is not used for scheduling and is not required for
the site to work.

## Copyright approach

The pipeline never stores or displays full article text. It only ever sends
the model a headline and the short public description/dek a publisher exposes
in its own RSS feed for syndication — the same fields any news reader app
would use. Every article links back to the original source with a
"Read Original Article" button.

## Troubleshooting: "the site isn't showing new articles"

If content looks frozen, check in this order:

1. **GitHub Actions tab** — is the "Fetch News" workflow actually running every
   10 minutes, and is it green? A red run almost always means
   `DATABASE_URL` or `ANTHROPIC_API_KEY` isn't set (or has expired) as a
   repository secret — the script now fails loudly and exits non-zero in
   that case instead of silently doing nothing.
2. **The `IngestLog` table** — each run writes a row with `itemsSeen`,
   `itemsNew`, `itemsSkipped`, and any `errorMessage`. If `itemsNew` is
   consistently 0 with no errors, there's simply no new news right now
   (normal). If it's 0 *with* errors every run, something's broken
   upstream (bad API key, DB unreachable, a feed URL that stopped working).
3. **Page caching** — `article/[slug]` and `category/[category]` pages use
   `revalidate = 120`, so new rows in the database should appear within two
   minutes without a redeploy. If you still see stale content after that,
   check your CDN/browser isn't hard-caching (a hard refresh should confirm).

## Deploying (Vercel Hobby plan)

1. Push this repo to GitHub.
2. Import it into Vercel — the Hobby (free) plan is sufficient; nothing here
   requires Pro.
3. Add the environment variables from `.env.example` in Vercel's project
   settings (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`,
   `CRON_SECRET`).
4. Provision a Postgres database (Vercel Postgres, Neon, or Supabase all work
   on their free tiers) and run `npm run db:push` once against it.
5. Deploy.
6. Add `DATABASE_URL` and `ANTHROPIC_API_KEY` as GitHub Actions repository
   secrets so the scheduler in step "Keeping it running automatically" above
   can start publishing new stories every 10 minutes.

No Vercel Cron configuration is needed or used anywhere in this project.
