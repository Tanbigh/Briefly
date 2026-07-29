"use client";

import { useState } from "react";
import type { Article } from "@/lib/types";
import NewsCard from "./NewsCard";

export default function LoadMoreArticles({
  remaining
}: {
  initialCount: number;
  remaining: Article[];
}) {
  const [shown, setShown] = useState(0);
  const batch = remaining.slice(0, shown);
  const hasMore = shown < remaining.length;

  if (remaining.length === 0) return null;

  return (
    <>
      {batch.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {batch.map((a) => (
            <NewsCard key={a.id} article={a} />
          ))}
        </div>
      )}
      {hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => setShown((n) => Math.min(n + 6, remaining.length))}
            className="rounded-full border border-terracotta px-6 py-2.5 text-sm font-medium text-terracotta transition-colors hover:bg-terracotta hover:text-ivory"
          >
            Load more
          </button>
        </div>
      )}
    </>
  );
}
