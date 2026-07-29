import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: "#FFFDF8",
        beige: "#F7F3EC",
        cream: "#FFF8F2",
        peach: "#FDF4EC",
        card: "#FFFFFF",
        "card-soft": "#FBF6EE",
        terracotta: {
          DEFAULT: "#B5603C",
          soft: "#D98A63"
        },
        sand: "#D9C4A3",
        gold: "#B8912E",
        brown: {
          DEFAULT: "#6B5B4E",
          deep: "#453A31"
        },
        slateblue: "#5B6B8C",
        ink: "#2B2621",
        "ink-soft": "#5B5147"
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
