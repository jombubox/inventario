import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";

import {
  isTheme,
  nextTheme,
  resolveTheme,
  themeInitializationScript,
} from "@/features/theme/theme";

function runInitializationScript({
  storedTheme,
  prefersDark,
  storageAvailable = true,
}: {
  storedTheme: string | null;
  prefersDark: boolean;
  storageAvailable?: boolean;
}) {
  const root = { dataset: {} as Record<string, string> };

  runInNewContext(themeInitializationScript, {
    document: { documentElement: root },
    window: {
      localStorage: {
        getItem: () => {
          if (!storageAvailable) throw new Error("Storage unavailable");
          return storedTheme;
        },
      },
      matchMedia: () => ({ matches: prefersDark }),
    },
  });

  return root.dataset.theme;
}

describe("theme preferences", () => {
  it("honors an explicit stored preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("uses the system preference when no valid selection is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(undefined, false)).toBe("light");
    expect(resolveTheme("unknown", true)).toBe("dark");
  });

  it("recognizes supported themes and toggles between them", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(false);
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });

  it("initializes the document before hydration from storage or the system", () => {
    expect(runInitializationScript({ storedTheme: "light", prefersDark: true })).toBe(
      "light",
    );
    expect(runInitializationScript({ storedTheme: "dark", prefersDark: false })).toBe(
      "dark",
    );
    expect(runInitializationScript({ storedTheme: null, prefersDark: true })).toBe("dark");
    expect(
      runInitializationScript({
        storedTheme: null,
        prefersDark: false,
        storageAvailable: false,
      }),
    ).toBe("light");
  });
});
