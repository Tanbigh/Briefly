import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getArticleBySlug } from "@/lib/data";
import { formatRelativeTime } from "@/lib/format";
import BookmarkButton from "@/components/BookmarkButton";
import ShareButton from "@/components/ShareButton";

// No generateStaticParams here on purpose: this is a database-free,
// RSS-driven site, and generateStaticParams would run at `next build`
// time — before the build has network access to RSS/the Gemini API in
// most CI setups, and before any of today's stories exist. Instead every
// slug is rendered on demand (first visit) and then cached for
// `revalidate` seconds, same as the other pages — fast for every
// subsequent reader without requiring a build-time crawl.
export const revalidate = 120;
export const dynamicParams = true;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const article = await getArticleBySlug(params.slug);
  if (!article) return {};
  return {
    title: article.headline,
    description: article.takeaway,
    alternates: { canonical: `/article/${article.slug}` },
    openGraph: {
      title: article.headline,
      description: article.takeaway,
      images: article.imageUrl ? [article.imageUrl] : undefined,
      type: "article",
      publishedTime: article.publishedAt
    }
  };
}

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const article = await getArticleBySlug(params.slug);
  if (!article) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.headline,
    datePublished: article.publishedAt,
    image: article.imageUrl ? [article.imageUrl] : undefined,
    author: { "@type": "Organization", name: "Briefly" },
    publisher: { "@type": "Organization", name: "Briefly" },
    isBasedOn: article.sourceUrl,
    description: article.takeaway
  };

  return (
    <article className="container-editorial py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mb-6 flex items-center gap-2 text-sm text-ink-soft">
        <span className="rounded-full bg-beige px-3 py-1 text-terracotta">{article.category}</span>
        <span aria-hidden>·</span>
        <span>{article.source}</span>
        <span aria-hidden>·</span>
        <time dateTime={article.publishedAt}>{formatRelativeTime(article.publishedAt)}</time>
        <span aria-hidden>·</span>
        <span>{Math.round(article.readingTimeSeconds / 6) * 6}s read</span>
        <div className="ml-auto flex items-center gap-1">
          <BookmarkButton articleId={article.id} />
          <ShareButton headline={article.headline} slug={article.slug} />
        </div>
      </div>

      <h1 className="max-w-[24ch] font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">
        {article.headline}
      </h1>
      <p className="lang-bn headline mt-2 max-w-[24ch] text-2xl font-semibold leading-snug text-ink sm:text-3xl">
        {article.headlineBn}
      </p>

      <div className="mt-6 grid gap-8 rounded-xl2 border border-sand/40 bg-card p-6 sm:p-8 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
        {/* English column */}
        <div>
          <p className="mb-4 inline-flex items-start gap-1.5 rounded-lg bg-peach/60 px-3 py-2 text-sm font-medium text-terracotta">
            <span aria-hidden>📌</span>
            <span>{article.takeaway}</span>
          </p>
          <div className="max-w-prose space-y-4 text-[15px] leading-relaxed text-ink-soft">
            {article.summaryEn.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>

        {/* Center image (desktop) */}
        {article.imageUrl && (
          <div className="order-first lg:order-none lg:w-[280px]">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl2 lg:sticky lg:top-24">
              <Image src={article.imageUrl} alt="" fill sizes="280px" className="object-cover" />
            </div>
          </div>
        )}

        {/* Bengali column */}
        <div className="lg:border-l lg:border-gold/30 lg:pl-8">
          <p className="lang-bn mb-4 inline-flex items-start gap-1.5 rounded-lg bg-peach/60 px-3 py-2 text-sm font-medium text-terracotta">
            <span aria-hidden>📌</span>
            <span>{article.takeawayBn}</span>
          </p>
          <div className="lang-bn max-w-prose space-y-4 text-base text-ink-soft">
            {article.summaryBn.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-start gap-3 border-t border-sand/40 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-soft">
          Source: <span className="font-medium text-ink">{article.source}</span> — Briefly publishes AI-generated
          summaries only and never reproduces full articles.
        </p>
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="shrink-0 rounded-full bg-terracotta px-5 py-2 text-sm font-medium text-ivory hover:bg-terracotta-soft"
        >
          Read Original Article →
        </a>
      </div>
    </article>
  );
}
