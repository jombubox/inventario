import { describe, expect, it } from "vitest";

import {
  assertSameOriginMutation,
  InvalidRequestOriginError,
} from "@/lib/request-security";

describe("same-origin mutation guard", () => {
  it("accepts a matching origin", () => {
    expect(() => assertSameOriginMutation(new Request("https://jombubox.example/api/test", {
      method: "POST",
      headers: { origin: "https://jombubox.example" },
    }))).not.toThrow();
  });

  it("uses the forwarded host behind a trusted application proxy", () => {
    expect(() => assertSameOriginMutation(new Request("http://localhost:3000/api/test", {
      method: "POST",
      headers: {
        host: "jombubox.example",
        "x-forwarded-host": "jombubox.example",
        origin: "https://jombubox.example",
      },
    }))).not.toThrow();
  });

  it("rejects cross-site and originless requests", () => {
    const scenarios: HeadersInit[] = [
      { origin: "https://attacker.example" },
      { "sec-fetch-site": "cross-site" },
      {},
    ];
    for (const headers of scenarios) {
      expect(() => assertSameOriginMutation(new Request("https://jombubox.example/api/test", {
        method: "POST",
        headers,
      }))).toThrow(InvalidRequestOriginError);
    }
  });
});
