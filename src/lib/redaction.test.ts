import { describe, expect, it } from "vitest";

import { redactSensitiveData, redactText } from "@/lib/redaction";

describe("observability redaction", () => {
  it("redacts secrets recursively without mutating safe context", () => {
    expect(redactSensitiveData({
      userId: "user-1",
      token: "secret-token",
      nested: { password: "secret-password", count: 2 },
    })).toEqual({
      userId: "user-1",
      token: "[REDACTED]",
      nested: { password: "[REDACTED]", count: 2 },
    });
  });

  it("removes connection strings and bearer values from error text", () => {
    const output = redactText(
      "postgresql://user:pass@db.example/test?sslmode=require Bearer abc.def.ghi",
    );
    expect(output).not.toContain("user:pass");
    expect(output).not.toContain("abc.def.ghi");
  });
});
