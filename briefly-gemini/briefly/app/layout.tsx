import type { Metadata, Viewport } from "next";
import { Inter, Manrope, Noto_Serif_Bengali, Hind_Siliguri } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const notoSerifBengali = Noto_Serif_Bengali({
  subsets: ["bengali"],
  weight: ["500", "600", "700"],
  variable: "--font-noto-serif-bengali",
  display: "swap"
});
const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali"],
  weight: ["400", "500", "600"],
  variable: "--font-hind-siliguri",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://briefly.news"),
  title: {
    default: "Briefly — Important News, Clearly Explained",
    template: "%s — Briefly"
  },
  description:
    "Briefly delivers AI-summarized news in English and natural Bengali, sourced from trusted outlets like Reuters, BBC, and PIB — read in under a minute.",
  openGraph: {
    type: "website",
    siteName: "Briefly",
    title: "Briefly — Important News, Clearly Explained",
    description:
      "AI-summarized bilingual news briefings from trusted sources, in English and natural Bengali."
  },
  twitter: {
    card: "summary_large_image",
    title: "Briefly — Important News, Clearly Explained"
  },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.ico" }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFDF8" },
    { media: "(prefers-color-scheme: dark)", color: "#161311" }
  ]
};

// Runs before hydration so the correct theme class is on <html> for the
// very first paint — this is what prevents a flash of light mode for
// users who prefer (or previously chose) dark. Kept tiny and dependency-
// free since it blocks rendering.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("briefly-theme");
    var theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable} ${notoSerifBengali.variable} ${hindSiliguri.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col bg-ivory text-ink">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory"
        >
          Skip to content
        </a>
        <Header />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
