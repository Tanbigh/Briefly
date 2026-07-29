"use client";

export default function ShareButton({ headline, slug }: { headline: string; slug: string }) {
  async function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/article/${slug}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: headline, url });
      } catch {
        // user cancelled — no action needed
      }
    } else {
      await navigator.clipboard.writeText(url);
    }
  }

  return (
    <button
      onClick={handleShare}
      aria-label="Share this article"
      className="rounded-full p-2 text-ink-soft hover:bg-beige hover:text-terracotta"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="18" cy="5" r="2.5" />
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="19" r="2.5" />
        <path d="M8.2 10.8 15.8 6.2M8.2 13.2l7.6 4.6" />
      </svg>
    </button>
  );
}
