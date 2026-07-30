import type { Metadata } from "next";
import CategoryNav from "@/components/CategoryNav";
import NewsCard from "@/components/NewsCard";
import { getArticlesByCategory } from "@/lib/data";

// See app/article/[slug]/page.tsx for why this is required.
export const revalidate = 120;

export async function generateMetadata({ params }: { params: { category: string } }): Promise<Metadata> {
  const category = decodeURIComponent(params.category);
  return { title: category, description: `Latest ${category} news, summarized in English and Bengali by Briefly.` };
}

export default async function CategoryPage({ params }: { params: { category: string } }) {
  const category = decodeURIComponent(params.category);
  const articles = await getArticlesByCategory(category);

  return (
    <>
      <CategoryNav active={category} />
      <section className="container-editorial py-10">
        <h1 className="mb-6 font-display text-2xl font-bold text-ink">{category}</h1>
        {articles.length === 0 ? (
          <p className="text-ink-soft">
            No {category} stories yet — Briefly checks trusted sources every few minutes, so check back shortly.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <NewsCard key={a.id} article={a} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
