import { describe, expect, it } from "vitest";

import { getSiteUrl } from "@/lib/site-url";

describe("public site URL", () => {
  it("uses the configured canonical origin and strips paths", () => {
    expect(
      getSiteUrl({
        NEXT_PUBLIC_SITE_URL: "https://catalog.example/base",
        NODE_ENV: "production",
      })?.toString(),
    ).toBe("https://catalog.example/");
  });

  it("uses localhost only in development and never invents a production host", () => {
    expect(getSiteUrl({ NODE_ENV: "development" })?.toString()).toBe("http://localhost:3000/");
    expect(getSiteUrl({ NODE_ENV: "production" })).toBeNull();
  });
});
