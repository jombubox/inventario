import { createHash, randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

export async function directUpload(page: Page, options: { headers: Record<string, string>; multipart: { productId: string; alt: string; file: { name: string; mimeType: string; buffer: Buffer } } }) {
  const { productId, alt, file } = options.multipart;
  const authorization = await page.request.post("/api/products/images/upload", { headers: options.headers,
    data: { productId, alt, uploadId: randomUUID(), batchId: randomUUID(), position: 0, filename: file.name, mimeType: file.mimeType, size: file.buffer.byteLength,
      signatureHex: file.buffer.subarray(0, 12).toString("hex"), fingerprint: createHash("sha256").update(file.buffer).digest("hex") } });
  if (!authorization.ok()) return authorization;
  const { token, uploadUrl, headers } = await authorization.json();
  const upload = await page.request.put(uploadUrl, { headers, data: file.buffer });
  if (!upload.ok()) return upload;
  return page.request.post("/api/products/images/confirm", { headers: options.headers, data: { token } });
}
