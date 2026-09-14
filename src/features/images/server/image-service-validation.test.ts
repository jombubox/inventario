import { describe, expect, it } from "vitest";

import type { Database } from "@/db/connection";
import { createProductImage } from "@/features/images/server/image-service";
import type { ImageStorage } from "@/features/images/server/r2";
import { InvalidOperationError } from "@/features/shared/domain/service-errors";

describe("image service validation", () => {
  it("turns unsupported files into a client-safe operation error before DB or R2 access", async () => {
    await expect(
      createProductImage({} as Database, {} as ImageStorage, {
        productId: "10000000-0000-4000-8000-000000000001",
        filename: "not-an-image.txt",
        mimeType: "text/plain",
        bytes: new TextEncoder().encode("not an image"),
      }),
    ).rejects.toBeInstanceOf(InvalidOperationError);
  });
});
