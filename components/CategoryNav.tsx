import Link from "next/link";
import { CATEGORY_LIST } from "@/lib/mock-data";

export default function CategoryNav({ active }: { active?: string }) {
  return (
    <nav aria-label="Browse by category" className="border-b border-sand/40 bg-beige/60">
      <div className="container-editorial flex gap-2 overflow-x-auto py-3 [scrollbar-width:none]">
        <Link
          href="/"
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
            !active ? "border-terracotta bg-terracotta text-ivory" : "border-sand/60 text-ink-soft hover:border-terracotta"
          }`}
        >
          Today
        </Link>
        {CATEGORY_LIST.map((cat) => (
          <Link
            key={cat}
            href={`/category/${encodeURIComponent(cat)}`}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              active === cat ? "border-terracotta bg-terracotta text-ivory" : "border-sand/60 text-ink-soft hover:border-terracotta"
            }`}
          >
            {cat}
          </Link>
        ))}
      </div>
    </nav>
  );
}
