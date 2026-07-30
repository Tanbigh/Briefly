import Link from "next/link";
import SearchBar from "./SearchBar";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-sand/50 bg-ivory/90 backdrop-blur">
      <div className="container-editorial flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-baseline gap-2 shrink-0">
          <span className="font-display text-2xl font-bold tracking-tightish text-ink">Briefly</span>
          <span className="hidden text-xs text-ink-soft sm:inline">EN · বাংলা</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-ink-soft lg:flex">
          <Link href="/category/Breaking%20News" className="hover:text-terracotta transition-colors">
            Breaking
          </Link>
          <Link href="/category/India" className="hover:text-terracotta transition-colors">
            India
          </Link>
          <Link href="/category/World" className="hover:text-terracotta transition-colors">
            World
          </Link>
          <Link href="/category/Cricket" className="hover:text-terracotta transition-colors">
            Cricket
          </Link>
          <Link href="/category/Technology" className="hover:text-terracotta transition-colors">
            Technology
          </Link>
          <Link href="/weather" className="hover:text-terracotta transition-colors">
            Weather
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <div className="w-full max-w-[260px]">
            <SearchBar compact />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
