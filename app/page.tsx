import Hero from "@/components/Hero";
import BreakingBanner from "@/components/BreakingBanner";
import CategoryNav from "@/components/CategoryNav";
import NewsCard from "@/components/NewsCard";
import LoadMoreArticles from "@/components/LoadMoreArticles";
import { getArticles, getBreakingArticle, getTrendingArticles } from "@/lib/data";

// Same reasoning as app/article/[slug]/page.tsx: this is a database-free,
// RSS-driven site, and Next.js would otherwise try to statically generate
// this route at `next build` time — before the build has network access to
// RSS/the Gemini API in most CI/deploy setups. Render on demand instead;
// getArticles() is already cached internally via unstable_cache.
export const dynamic = "force-dynamic";
export const revalidate = 120;

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
