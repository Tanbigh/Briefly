export default function Hero() {
  return (
    <section className="border-b border-sand/40 bg-gradient-to-b from-peach/70 to-ivory">
      <div className="container-editorial py-14 sm:py-20">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-terracotta">
          English · বাংলা
        </p>
        <h1 className="max-w-[16ch] font-display text-4xl font-bold leading-[1.08] tracking-tightish text-ink sm:text-6xl">
          Important news.
          <br />
          Clearly explained.
        </h1>
        <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-ink-soft sm:text-lg">
          Briefly reads the day's news from trusted sources — Reuters, BBC, AP, PIB, DD News —
          and gives you the essential facts in under a minute, in fluent English and
          natural Bengali newspaper prose.
        </p>
      </div>
    </section>
  );
}
