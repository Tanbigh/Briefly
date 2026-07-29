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

Two options are wired up — use whichever fits your plan:

1. **Vercel Cron** (`vercel.json`) calls `/api/cron/fetch-news` on a schedule.
   Note: Vercel's free (Hobby) plan only allows once-per-day cron jobs; a Pro
   plan is needed for the every-10-minutes schedule configured here.
2. **GitHub Actions** (`.github/workflows/fetch-news.yml`) runs
   `npm run fetch-news` every 10 minutes regardless of hosting plan — add
   `DATABASE_URL` and `ANTHROPIC_API_KEY` as repository secrets.

Either way, once deployed and scheduled, the site updates itself with no
further manual work.

## Copyright approach

The pipeline never stores or displays full article text. It only ever sends
the model a headline and the short public description/dek a publisher exposes
in its own RSS feed for syndication — the same fields any news reader app
would use. Every article links back to the original source with a
"Read Original Article" button.

## Deploying

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add the environment variables from `.env.example` in Vercel's project settings.
4. Provision a Postgres database (Vercel Postgres, Neon, or Supabase all work)
   and run `npm run db:push` once against it.
5. Deploy. Set up the cron job (Vercel Cron or GitHub Actions) so new stories
   keep publishing automatically.
