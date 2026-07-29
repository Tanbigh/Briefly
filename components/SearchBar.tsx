"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SearchBar({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <form onSubmit={handleSubmit} role="search" aria-label="Search Briefly news">
      <label htmlFor="briefly-search" className="sr-only">
        Search by headline, person, organization, or location
      </label>
      <input
        id="briefly-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search news, people, places…"
        className={`w-full rounded-full border border-sand/70 bg-card px-4 text-sm text-ink placeholder:text-ink-soft/60 focus:border-terracotta ${
          compact ? "h-10" : "h-12 text-base"
        }`}
      />
    </form>
  );
}
