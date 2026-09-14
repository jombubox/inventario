"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  isTheme,
  nextTheme,
  resolveTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/features/theme/theme";

function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }));
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncFromDocument = () => {
      const documentTheme = document.documentElement.dataset.theme;
      setTheme(resolveTheme(documentTheme, mediaQuery.matches));
    };
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const resolved = resolveTheme(event.newValue, mediaQuery.matches);
      applyTheme(resolved);
      setTheme(resolved);
    };
    const syncFromSystem = (event: MediaQueryListEvent) => {
      if (isTheme(readStoredTheme())) return;
      const resolved = event.matches ? "dark" : "light";
      applyTheme(resolved);
      setTheme(resolved);
    };
    const syncFromThemeChange = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail;
      if (isTheme(next)) setTheme(next);
    };

    syncFromDocument();
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(THEME_CHANGE_EVENT, syncFromThemeChange);
    mediaQuery.addEventListener("change", syncFromSystem);

    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, syncFromThemeChange);
      mediaQuery.removeEventListener("change", syncFromSystem);
    };
  }, []);

  const dark = theme === "dark";
  const label = theme
    ? `Cambiar a modo ${dark ? "claro" : "oscuro"}`
    : "Cambiar tema de color";

  const toggleTheme = () => {
    const current = resolveTheme(
      document.documentElement.dataset.theme,
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
    const next = nextTheme(current);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}

    applyTheme(next);
    setTheme(next);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="theme-toggle relative overflow-hidden"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
        className="theme-toggle-sun absolute size-5"
      >
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="theme-toggle-moon absolute size-5"
      >
        <path d="M20.2 15.3A8.5 8.5 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z" />
      </svg>
    </Button>
  );
}
