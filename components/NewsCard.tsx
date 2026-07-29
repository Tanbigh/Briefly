import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import BookmarkButton from "./BookmarkButton";
import ShareButton from "./ShareButton";

export default function NewsCard({ article, featured = false }: { article: Article; featured?: boolean }) {
  return (
    <article
      className={`group overflow-hidden rounded-xl2 border border-sand/40 bg-card shadow-card transition-shadow hover:shadow-soft ${
        featured ? "sm:col-span-2" : ""
      }`}
    >
      <Link href={`/article/${article.slug}`} className="block">
        {article.imageUrl && (
          <div className={`relative w-full overflow-hidden ${featured ? "aspect-[16/8]" : "aspect-[16/10]"}`}>
            <Image
              src={article.imageUrl}
              alt=""
              fill
              sizes={featured ? "(min-width: 640px) 800px, 100vw" : "(min-width: 640px) 400px, 100vw"}
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
            <span className="absolute left-3 top-3 rounded-full bg-ivory/95 px-3 py-1 text-xs font-medium text-terracotta shadow-soft">
              {article.category}
            </span>
          </div>
        )}

        <div className="p-5">
          <div className="mb-2 flex items-center gap-2 text-xs text-ink-soft/80">
            <span>{article.source}</span>
            <span aria-hidden>·</span>
            <time dateTime={article.publishedAt}>{formatRelativeTime(article.publishedAt)}</time>
            <span aria-hidden>·</span>
            <span>{Math.round(article.readingTimeSeconds / 6) * 6}s read</span>
          </div>

          <h3 className={`font-display font-semibold text-ink ${featured ? "text-2xl" : "text-lg"} leading-snug`}>
            {article.headline}
          </h3>

          <p className="mt-2 inline-flex items-start gap-1.5 text-sm text-terracotta">
            <span aria-hidden>📌</span>
            <span>{article.takeaway}</span>
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-sand/40 pt-4 sm:grid-cols-2 sm:divide-x sm:divide-gold/30">
            <p className="text-sm leading-relaxed text-ink-soft line-clamp-3">{article.summaryEn[0]}</p>
            <p className="lang-bn text-sm leading-relaxed text-ink-soft line-clamp-3 sm:pl-4">{article.summaryBn[0]}</p>
          </div>
        </div>
      </Link>

      <div className="flex items-center justify-between border-t border-sand/40 px-5 py-3">
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-xs font-medium text-slateblue hover:underline"
        >
          Read Original Article →
        </a>
        <div className="flex items-center gap-1">
          <BookmarkButton articleId={article.id} />
          <ShareButton headline={article.headline} slug={article.slug} />
        </div>
      </div>
    </article>
  );
}
