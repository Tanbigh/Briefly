import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-sand/50 bg-cream">
      <div className="container-editorial py-12">
        <div className="grid grid-cols-2 gap-8 text-sm text-ink-soft sm:grid-cols-4">
          <div>
            <p className="mb-3 font-display font-semibold text-ink">Briefly</p>
            <p className="max-w-[26ch] text-ink-soft/90">
              Important news, clearly explained — in English and natural Bengali.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/about" className="hover:text-terracotta">About</Link>
            <Link href="/privacy" className="hover:text-terracotta">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-terracotta">Terms of Service</Link>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/contact" className="hover:text-terracotta">Contact</Link>
            <Link href="/disclaimer" className="hover:text-terracotta">Disclaimer</Link>
            <Link href="/rss.xml" className="hover:text-terracotta">RSS Feed</Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-ink-soft/70">Sources</span>
            <span className="text-ink-soft/70">Reuters · BBC · AP · PIB · DD News</span>
          </div>
        </div>
      </div>
      <div className="border-t border-sand/40 py-5">
        <p className="text-center text-xs text-ink-soft/70">Designed &amp; Developed by Tanbi Ghosh</p>
      </div>
    </footer>
  );
}
