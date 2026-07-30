export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <section className="container-editorial max-w-prose py-14">
      <h1 className="mb-4 font-display text-3xl font-bold text-ink">Contact</h1>
      <p className="leading-relaxed text-ink-soft">
        For corrections, takedown requests, or general questions, email{" "}
        <a href="mailto:hello@briefly.news" className="text-slateblue hover:underline">
          hello@briefly.news
        </a>
        . Publishers who would like to discuss syndication terms are also welcome to reach out
        here.
      </p>
    </section>
  );
}
