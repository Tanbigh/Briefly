export const metadata = { title: "Disclaimer" };

export default function DisclaimerPage() {
  return (
    <section className="container-editorial max-w-prose py-14">
      <h1 className="mb-4 font-display text-3xl font-bold text-ink">Disclaimer</h1>
      <div className="space-y-4 leading-relaxed text-ink-soft">
        <p>
          All English and Bengali summaries on Briefly are generated automatically by an AI
          model from publicly available headlines and short descriptions provided by the
          original publisher. Briefly does not reproduce full articles.
        </p>
        <p>
          Every article credits its original source and links to the publisher's full report.
          Briefly is an independent summarization service and is not affiliated with Reuters,
          BBC, the Associated Press, PIB, or DD News.
        </p>
      </div>
    </section>
  );
}
