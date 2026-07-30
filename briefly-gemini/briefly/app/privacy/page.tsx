export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <section className="container-editorial max-w-prose py-14">
      <h1 className="mb-4 font-display text-3xl font-bold text-ink">Privacy Policy</h1>
      <div className="space-y-4 leading-relaxed text-ink-soft">
        <p>
          Briefly stores bookmarks locally in your browser and does not require an account to
          read the news. We do not sell personal data to advertisers or third parties.
        </p>
        <p>
          Basic, anonymized usage analytics may be collected to understand which stories and
          categories are read, purely to improve the service.
        </p>
        <p>
          If you have questions about this policy, please reach out via the Contact page.
        </p>
      </div>
    </section>
  );
}
