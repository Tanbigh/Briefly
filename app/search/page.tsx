import NewsCard from "@/components/NewsCard";
import SearchBar from "@/components/SearchBar";
import { searchArticles } from "@/lib/data";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const query = searchParams.q ?? "";
  const results = query ? await searchArticles(query) : [];

  return (
    <section className="container-editorial py-10">
      <h1 className="mb-4 font-display text-2xl font-bold text-ink">Search</h1>
      <div className="mb-8 max-w-md">
        <SearchBar />
      </div>

      {query && (
        <p className="mb-6 text-sm text-ink-soft">
          {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((a) => (
          <NewsCard key={a.id} article={a} />
        ))}
      </div>
    </section>
  );
}
