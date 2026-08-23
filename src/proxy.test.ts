import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "@/middleware";

describe("admin route proxy", () => {
  it("redirects a visitor without a session cookie to login", () => {
    const response = middleware(
      new NextRequest("https://jombubox.example/admin/productos"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://jombubox.example/login?next=%2Fadmin%2Fproductos",
    );
  });
});
