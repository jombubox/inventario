import { assertSafeImageDescription, imageSignatureHex } from "@/features/images/domain/image-policy";
import { parseApiResponse } from "@/features/images/domain/api-response";

type UploadAuthorization = { image?: { id: string }; token?: string; uploadUrl?: string; headers?: Record<string, string> };
const errorOptions = { fallbackError: "No fue posible subir la foto. Reintenta la subida.",
  payloadTooLargeError: "El servidor rechazó el tamaño de esta foto. Intenta con una versión más pequeña." };

function putDirectly(url: string, headers: Record<string, string>, file: File, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.timeout = 240_000;
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round(event.loaded / event.total * 100)));
    };
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve()
      : reject(new Error("R2 rechazó la subida de la foto. Reintenta la subida."));
    request.onerror = () => reject(new Error("No fue posible conectar con R2. Revisa tu conexión y reintenta la subida."));
    request.ontimeout = () => reject(new Error("La subida de la foto tardó demasiado. Reintenta la subida."));
    request.onabort = () => reject(new Error("La subida de la foto se interrumpió. Reintenta la subida."));
    request.send(file);
  });
}

export async function uploadProductPhoto(file: File, input: { productId: string; uploadId: string; batchId: string; position: number }, onProgress: (value: number) => void) {
  const bytes = await file.arrayBuffer();
  const description = { filename: file.name, mimeType: file.type, size: file.size, signatureHex: imageSignatureHex(new Uint8Array(bytes)) };
  assertSafeImageDescription(description);
  const fingerprint = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const authorization = await parseApiResponse<UploadAuthorization>(await fetch("/api/products/images/upload", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, ...description, fingerprint, alt: file.name.replace(/\.[^.]+$/u, "") }),
  }), errorOptions);
  if (authorization.image) { onProgress(100); return; }
  if (!authorization.uploadUrl || !authorization.token || !authorization.headers) throw new Error("La autorización de la foto no es válida.");
  await putDirectly(authorization.uploadUrl, authorization.headers, file, onProgress);
  await parseApiResponse(await fetch("/api/products/images/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: authorization.token }),
  }), errorOptions);
  onProgress(100);
}
