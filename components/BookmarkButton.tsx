"use client";

import { useEffect, useState } from "react";

export default function BookmarkButton({ articleId }: { articleId: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const bookmarks = JSON.parse(localStorage.getItem("briefly:bookmarks") ?? "[]");
    setSaved(bookmarks.includes(articleId));
  }, [articleId]);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const bookmarks: string[] = JSON.parse(localStorage.getItem("briefly:bookmarks") ?? "[]");
    const next = saved ? bookmarks.filter((id) => id !== articleId) : [...bookmarks, articleId];
    localStorage.setItem("briefly:bookmarks", JSON.stringify(next));
    setSaved(!saved);
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? "Remove bookmark" : "Bookmark this article"}
      className="rounded-full p-2 text-ink-soft hover:bg-beige hover:text-terracotta"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
