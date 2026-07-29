import Link from "next/link";
import type { Article } from "@/lib/types";

export default function BreakingBanner({ article }: { article: Article }) {
  return (
    <Link
      href={`/article/${article.slug}`}
      className="block border-b border-terracotta/20 bg-[#F6E7DC]"
    >
      <div className="container-editorial flex items-center gap-3 py-2.5 text-sm">
        <span className="shrink-0 rounded-full bg-terracotta px-2.5 py-0.5 text-xs font-semibold text-ivory">
          Breaking
        </span>
        <span className="truncate font-medium text-brown-deep">{article.headline}</span>
        <span className="ml-auto hidden shrink-0 text-xs text-ink-soft sm:inline">Read more →</span>
      </div>
    </Link>
  );
}
