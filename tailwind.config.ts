import type { Config } from "tailwindcss";

/**
 * Every color below is backed by a CSS custom property (defined in
 * app/globals.css as space-separated RGB, e.g. `--color-ivory: 255 253 248`)
 * instead of a fixed hex value. `.dark` in globals.css redefines the same
 * variable names to their dark-theme values, so toggling one class on
 * <html> re-themes every component that uses `bg-ivory`, `text-ink`, etc. —
 * without editing each component individually.
 *
 * The `<alpha-value>` token below is a plain string, not a function —
 * Tailwind substitutes it automatically at build time whenever an opacity
 * modifier is used (e.g. `bg-ivory/90` → `rgb(var(--color-ivory) / 0.9)`,
 * `bg-ivory` with no modifier → `rgb(var(--color-ivory) / 1)`). This is
 * the officially documented way to back a Tailwind color with a CSS
 * variable: https://tailwindcss.com/docs/customizing-colors#using-css-variables
 *
 * A previous version of this file used a function `({ opacityValue }) =>
 * ...` to build the same string. That works at runtime, but the `Config`
 * type's `colors` field isn't reliably typed to accept a function across
 * Tailwind 3.x patch versions, which is what caused the production build
 * to fail with a type error. Plain strings have no such issue — they're
 * unambiguously valid under `RecursiveKeyValuePair<string, string>` — and
 * produce byte-identical CSS output.
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: "rgb(var(--color-ivory) / <alpha-value>)",
        beige: "rgb(var(--color-beige) / <alpha-value>)",
        cream: "rgb(var(--color-cream) / <alpha-value>)",
        peach: "rgb(var(--color-peach) / <alpha-value>)",
        card: "rgb(var(--color-card) / <alpha-value>)",
        "card-soft": "rgb(var(--color-card-soft) / <alpha-value>)",
        terracotta: {
          DEFAULT: "rgb(var(--color-terracotta) / <alpha-value>)",
          soft: "rgb(var(--color-terracotta-soft) / <alpha-value>)"
        },
        sand: "rgb(var(--color-sand) / <alpha-value>)",
        gold: "rgb(var(--color-gold) / <alpha-value>)",
        brown: {
          DEFAULT: "rgb(var(--color-brown) / <alpha-value>)",
          deep: "rgb(var(--color-brown-deep) / <alpha-value>)"
        },
        slateblue: "rgb(var(--color-slateblue) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--color-ink-soft) / <alpha-value>)",
        breaking: "rgb(var(--color-breaking-bg) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-manrope)", "system-ui", "sans-serif"],
        bengali: ["var(--font-noto-serif-bengali)", "serif"],
        "bengali-sans": ["var(--font-hind-siliguri)", "sans-serif"]
      },
      maxWidth: {
        prose: "68ch",
        editorial: "1180px"
      },
      letterSpacing: {
        tightish: "-0.01em"
      },
      boxShadow: {
        soft: "0 1px 2px rgba(43, 38, 33, 0.04), 0 8px 24px rgba(43, 38, 33, 0.05)",
        card: "0 1px 3px rgba(43, 38, 33, 0.06), 0 2px 12px rgba(43, 38, 33, 0.04)"
      },
      borderRadius: {
        xl2: "1.25rem"
      }
    }
  },
  plugins: []
};

export default config;
