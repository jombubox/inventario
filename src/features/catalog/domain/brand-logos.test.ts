import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { electronicsLogos, shippingLogos } from "./brand-logos";

describe("local logo inventory", () => {
  it("preserves all 18 supplied SVGs and displays each identified company once", () => {
    const root = join(process.cwd(), "public/images/marcas");
    expect(readdirSync(join(root, "electronicos")).filter((file) => file.endsWith(".svg"))).toHaveLength(12);
    expect(readdirSync(join(root, "paqueterias")).filter((file) => file.endsWith(".svg"))).toHaveLength(6);
    expect(shippingLogos.map((logo) => logo.name)).toEqual(["DHL", "Estafeta", "FedEx"]);
    const logos = [...electronicsLogos, ...shippingLogos];
    expect(new Set(logos.map((logo) => logo.name)).size).toBe(15);
    for (const logo of logos) {
      const svg = readFileSync(join(process.cwd(), "public", logo.src), "utf8");
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/<script\b|\bonload=|(?:xlink:)?href=["']https?:/iu);
      const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/u)!;
      expect(logo.width / logo.height).toBeCloseTo(Number(viewBox[1]) / Number(viewBox[2]), 4);
    }
  });
});
