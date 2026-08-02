import Hero from "@/components/Hero";
import BreakingBanner from "@/components/BreakingBanner";
import CategoryNav from "@/components/CategoryNav";
import NewsCard from "@/components/NewsCard";
import LoadMoreArticles from "@/components/LoadMoreArticles";
import { getArticles, getBreakingArticle, getTrendingArticles } from "@/lib/data";

// Same reasoning as app/article/[slug]/page.tsx: this is a database-free,
// RSS-driven site, and Next.js would otherwise try to statically generate
// this route at `next build` time — before the build has network access to
// RSS/the Gemini API in most CI/deploy setups. Render on demand instead.
//
// IMPORTANT: `dynamic = "force-dynamic"` only disables the Full Route
// Cache (the rendered HTML) — it does NOT disable the separate Data
// Cache that Next.js applies to individual fetch() calls made during
// the render, including ones made internally by third-party SDKs.
// getArticles() -> readSnapshot() -> lib/snapshot.ts calls
// @upstash/redis, whose REST client is fetch()-based; since that
// request always hits the same URL (a constant key), Next.js's default
// fetch caching was serving the FIRST-EVER response to that request
// forever, no matter how many times this page re-rendered or how many
// times /api/cron/refresh wrote a new snapshot. `fetchCache =
// "force-no-store"` forces every fetch in this route segment,
// including that one, to always hit the network.
// (See vercel/next.js#64145 and #75370 — "force-dynamic does not opt
// out of the data cache" is confirmed Next.js behavior, not a bug in
// this codebase specifically.)
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Generating MAX_ARTICLES articles under Gemini's free-tier rate limit takes
// roughly MAX_ARTICLES * 13 seconds (see lib/data.ts and lib/ai.ts). Raise
// Vercel's default function timeout so a full rebuild has room to finish.
// Note: Hobby plans cap this at 60s regardless of what's set here — reduce
// MAX_ARTICLES or upgrade your plan if you're on Hobby.
export const maxDuration = 300;

export default async function HomePage() {
  const [articles, breaking, trending] = await Promise.all([
    getArticles(),
    getBreakingArticle(),
    getTrendingArticles()
  ]);

  const latest = articles.slice(0, 8);
  const rest = articles.slice(8);

  return (
    <>
      {breaking && <BreakingBanner article={breaking} />}
      <Hero />
      <CategoryNav />

      <section className="container-editorial py-10">
        <h2 className="mb-5 font-display text-xl font-semibold text-ink">Today&rsquo;s Brief</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {latest[0] && <NewsCard article={latest[0]} featured />}
          {latest.slice(1, 3).map((a) => (
            <NewsCard key={a.id} article={a} />
          ))}
        </div>
      </section>

      {trending.length > 0 && (
        <section className="container-editorial py-10">
          <h2 className="mb-5 font-display text-xl font-semibold text-ink">Trending</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {trending.map((a) => (
              <NewsCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

      <section className="container-editorial py-10">
        <h2 className="mb-5 font-display text-xl font-semibold text-ink">Latest Updates</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {latest.slice(3).map((a) => (
            <NewsCard key={a.id} article={a} />
          ))}
        </div>
        <LoadMoreArticles initialCount={latest.length} remaining={rest} />
      </section>
    </>
  );
}