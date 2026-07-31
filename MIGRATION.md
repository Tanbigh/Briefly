# Migrating to the snapshot-based architecture

## What changed

- `lib/data.ts` — rewritten. `getArticles()` and everything built on it
  (`getArticleBySlug`, `getArticlesByCategory`, `getBreakingArticle`,
  `getTrendingArticles`, `getHighExamRelevanceArticles`, `searchArticles`)
  keep the **exact same names and signatures** as before. They now just
  read a persisted snapshot instead of running the live pipeline — so
  **your existing page/route files that call these don't need to change.**
- `lib/snapshot.ts` — new. Thin Redis-backed store for one JSON snapshot.
- `app/api/cron/refresh/route.ts` — new. The only place the live
  RSS+AI pipeline runs now.
- `app/api/debug/news/route.ts` — new. Health/status endpoint.
- `.github/workflows/refresh.yml` — new. Free external scheduler that
  calls the refresh route every ~10 minutes (Vercel Hobby's own Cron
  can't go faster than once/day).
- `.env.example` — added `CRON_SECRET`, `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN`, and a few optional tuning vars.

`lib/ai.ts` and `lib/rss.ts` are unchanged — the throttling, retry, and
per-feed resilience logic in those files was already solid; the problem
was purely that the pipeline was being run from the wrong place.

## Steps to deploy

1. **Install the Redis client:**
   ```
   npm install @upstash/redis
   ```

2. **Provision storage:** Vercel dashboard → your project → Storage →
   Marketplace → search "Upstash Redis" → Connect to this project. This
   auto-injects `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` — `lib/snapshot.ts` accepts
   either naming).

3. **Set `CRON_SECRET`** in Vercel's Environment Variables — any long
   random string, e.g. generate one with `openssl rand -hex 32`.

4. **Deploy.** Copy the new/changed files into your repo at the same
   relative paths shown above (adjust the `@/lib/...` import alias in the
   two route files if your project uses a different path alias — check
   your `tsconfig.json`'s `paths` if unsure).

5. **Set up the scheduler:** in your GitHub repo → Settings → Secrets and
   variables → Actions → New repository secret. Add:
   - `BRIEFLY_SITE_URL` — your deployed site, e.g. `https://briefly.news`
     (no trailing slash)
   - `CRON_SECRET` — the same value from step 3

   The workflow in `.github/workflows/refresh.yml` starts running on its
   own once it's on the default branch — no further action needed.

6. **Prime the first snapshot manually** (don't wait for the first
   scheduled run):
   ```
   curl -X GET "https://your-site.com/api/cron/refresh" \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```
   Check the response — `"ok": true` and an `articleCount` above 0 means
   you're live. If `articleCount` is small, that's expected on a cold
   cache — it'll climb over the next several 10-minute cycles as more
   per-article AI generations complete and merge in (see
   `MIN_DESIRED_ARTICLES` in `lib/data.ts`).

7. **Check health any time** at `/api/debug/news` (add `?key=...` if you
   set `DEBUG_SECRET`). It shows last refresh time, article count, and
   per-feed status/errors — the fastest way to see what, if anything,
   needs attention.

## What you no longer need to do manually

- Fix a broken feed by hand-editing timing/budget numbers — a single bad
  feed is isolated by `lib/rss.ts`'s existing per-feed error handling and
  simply contributes 0 items that cycle.
- Worry about a Gemini outage taking the homepage down — a failed or
  thin refresh cycle leaves the previous snapshot fully intact.
- Manually re-trigger anything after a deploy or a transient failure —
  the next scheduled GitHub Actions run (within ~10 minutes) picks it
  back up automatically.

You'd still want to glance at `/api/debug/news` occasionally, or add a
feed to `TRUSTED_SOURCES` in `lib/rss.ts` if you want a new source — but
day-to-day babysitting shouldn't be necessary anymore.
