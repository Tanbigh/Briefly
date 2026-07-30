import type { Config } from "tailwindcss";

/**
 * Every color below is backed by a CSS custom property (defined in
 * app/globals.css as space-separated RGB, e.g. `--color-ivory: 255 253 248`)
 * instead of a fixed hex value. `.dark` in globals.css redefines the same
 * variable names to their dark-theme values, so toggling one class on
 * <html> re-themes every component that uses `bg-ivory`, `text-ink`, etc. —
 * without editing each component individually. The `rgb(var(...) / <alpha>)`
 * form preserves Tailwind's opacity-modifier syntax (e.g. `bg-ivory/90`).
 */
function withOpacity(varName: string) {
  return ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined ? `rgb(var(${varName}))` : `rgb(var(${varName}) / ${opacityValue})`;
}

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: withOpacity("--color-ivory"),
        beige: withOpacity("--color-beige"),
        cream: withOpacity("--color-cream"),
        peach: withOpacity("--color-peach"),
        card: withOpacity("--color-card"),
        "card-soft": withOpacity("--color-card-soft"),
        terracotta: {
          DEFAULT: withOpacity("--color-terracotta"),
          soft: withOpacity("--color-terracotta-soft")
        },
        sand: withOpacity("--color-sand"),
        gold: withOpacity("--color-gold"),
        brown: {
          DEFAULT: withOpacity("--color-brown"),
          deep: withOpacity("--color-brown-deep")
        },
        slateblue: withOpacity("--color-slateblue"),
        ink: withOpacity("--color-ink"),
        "ink-soft": withOpacity("--color-ink-soft"),
        breaking: withOpacity("--color-breaking-bg")
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
