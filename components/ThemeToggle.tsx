"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "briefly-theme";

/**
 * Toggles between light and dark mode.
 *
 * The *initial* theme (from localStorage, falling back to the system
 * `prefers-color-scheme`) is applied by a blocking inline script in
 * app/layout.tsx, before React hydrates — that's what prevents a flash
 * of the wrong theme on load. This component just reads the class that
 * script already set, then lets the user flip it from here on.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;

    // Briefly enable transitions for the switch, then remove the class so
    // unrelated interactions (hover states, etc.) aren't affected.
    root.classList.add("theme-transition");
    root.classList.toggle("dark", next === "dark");
    window.setTimeout(() => root.classList.remove("theme-transition"), 320);

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private browsing, disabled cookies, etc).
      // The toggle still works for the current page view either way.
    }

    setTheme(next);
  }

  // Render a same-sized placeholder until we know the real theme, so we
  // never briefly show the wrong icon before the effect above runs.
  if (theme === null) {
    return <div className="h-9 w-9 shrink-0" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={theme === "dark"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sand/60 text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta"
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.55 1.55M18.25 18.25l1.55 1.55M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.55-1.55M18.25 5.75l1.55-1.55" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
          <path d="M20.7 14.9A8.5 8.5 0 1 1 9.1 3.3a7 7 0 0 0 11.6 11.6Z" />
        </svg>
      )}
    </button>
  );
}
