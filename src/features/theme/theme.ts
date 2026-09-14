export const THEME_STORAGE_KEY = "jombubox-theme";
export const THEME_CHANGE_EVENT = "jombubox:theme-change";

export type Theme = "light" | "dark";

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveTheme(
  storedTheme: string | null | undefined,
  prefersDark: boolean,
): Theme {
  return isTheme(storedTheme) ? storedTheme : prefersDark ? "dark" : "light";
}

export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export const themeInitializationScript = `
(() => {
  const root = document.documentElement;
  let storedTheme = null;

  try {
    storedTheme = window.localStorage.getItem("${THEME_STORAGE_KEY}");
  } catch {}

  const theme = storedTheme === "light" || storedTheme === "dark"
    ? storedTheme
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

  root.dataset.theme = theme;
})();
`;
