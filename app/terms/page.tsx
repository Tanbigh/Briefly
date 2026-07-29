export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <section className="container-editorial max-w-prose py-14">
      <h1 className="mb-4 font-display text-3xl font-bold text-ink">Terms of Service</h1>
      <div className="space-y-4 leading-relaxed text-ink-soft">
        <p>
          Briefly provides AI-generated summaries of news reported by third-party publishers.
          Summaries are provided for informational convenience only; for full details and context,
          please read the original article via the linked publisher.
        </p>
        <p>
          Briefly is not responsible for the accuracy of third-party reporting. While the AI
          pipeline is designed to preserve facts, names, numbers, and dates exactly, errors can
          occur, and important decisions should not be based on Briefly summaries alone.
        </p>
        <p>
          By using this site, you agree not to scrape, resell, or misrepresent Briefly's content
          as your own.
        </p>
      </div>
    </section>
  );
}
