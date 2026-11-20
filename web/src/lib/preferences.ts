import { useEffect, useState } from "react";
import { isLocale, LOCALES, preferredLocale, type Locale } from "@assma/shared";

export type Theme = "light" | "dark";

// Language and theme are remembered on this device only; storage may be unavailable.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows and blocked storage simply forget the choice.
  }
}

function initialTheme(): Theme {
  const stored = read("assma.theme");
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialLocale(): Locale {
  const stored = read("assma.locale");
  return isLocale(stored) ? stored : preferredLocale(navigator.languages ?? [navigator.language]);
}

export function usePreferences() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    write("assma.theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    write("assma.locale", locale);
  }, [locale]);

  return {
    theme,
    locale,
    copy: LOCALES[locale],
    toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    setLocale,
  };
}

export type Preferences = ReturnType<typeof usePreferences>;
