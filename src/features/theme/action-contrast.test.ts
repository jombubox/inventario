import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function luminance(hex: string) {
  const rgb = hex.replace("#", "").match(/../gu)!.map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}

function contrast(left: string, right: string) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("primary action accessibility", () => {
  it.each(["light", "dark"])("meets normal-text AA and preserves brand/focus colors in %s", (theme) => {
    const body = css.match(theme === "light" ? /:root\s*\{([^}]+)\}/u : /:root\[data-theme="dark"\]\s*\{([^}]+)\}/u)![1]!;
    const token = (name: string) => body.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, "u"))![1]!;
    expect(token("primary")).toBe("#2F73F2");
    expect(token("action")).toBe("#2D6FEA");
    expect(token("action-foreground")).toBe("#FFFFFF");
    for (const state of ["action", "action-hover", "action-active"]) {
      expect(contrast(token(state), token("action-foreground"))).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(token("ring"), token("background"))).toBeGreaterThanOrEqual(3);
  });
});
