export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <section className="container-editorial max-w-prose py-14">
      <h1 className="mb-4 font-display text-3xl font-bold text-ink">About Briefly</h1>
      <p className="mb-4 leading-relaxed text-ink-soft">
        Briefly is an AI-powered news briefing platform built for readers who want to understand
        the news of the day without wading through long articles. Every story is drawn from
        trusted, licensed sources, then summarized by AI into a short English brief and a
        naturally written Bengali version — the way an experienced Bengali news editor would
        write it, not a machine translation.
      </p>
      <p className="leading-relaxed text-ink-soft">
        Briefly never republishes full articles. Every summary links back to the original
        publisher, and every fact — names, numbers, dates, quotes — is preserved exactly as
        reported.
      </p>
    </section>
  );
}
