export const MAX_PRODUCT_IMAGES = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const allowedImageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedImageMimeType = (typeof allowedImageMimeTypes)[number];

const extensionsByMime: Record<AllowedImageMimeType, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

const objectExtensionsByMime: Record<AllowedImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function assertSafeImageDescription(input: {
  filename: string;
  mimeType: string;
  size: number;
  signatureHex: string;
}) {
  if (!allowedImageMimeTypes.includes(input.mimeType as AllowedImageMimeType)) {
    throw new Error("Solo se permiten imágenes JPEG, PNG o WEBP.");
  }
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > MAX_IMAGE_BYTES) {
    throw new Error("Cada imagen debe pesar como máximo 10 MB.");
  }
  const mimeType = input.mimeType as AllowedImageMimeType;
  const lowerName = input.filename.toLowerCase();
  if (!extensionsByMime[mimeType].some((extension) => lowerName.endsWith(extension))) {
    throw new Error("La extensión del archivo no coincide con su tipo de imagen.");
  }
  const signature = input.signatureHex.toLowerCase();
  const valid =
    (mimeType === "image/jpeg" && signature.startsWith("ffd8ff")) ||
    (mimeType === "image/png" && signature.startsWith("89504e470d0a1a0a")) ||
    (mimeType === "image/webp" && signature.startsWith("52494646") && signature.slice(16, 24) === "57454250");
  if (!valid) throw new Error("La firma binaria no coincide con el tipo de imagen.");
}

export function safeImageFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._ -]/gu, "_").slice(0, 180) || "imagen";
}

export function imageSignatureHex(bytes: Uint8Array): string {
  return [...bytes.slice(0, 12)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function createProductImageObjectKey(sku: string, mimeType: AllowedImageMimeType): string {
  const productSegment = sku
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[-_]+|[-_]+$/gu, "")
    .slice(0, 100);
  if (!productSegment) throw new Error("El SKU no permite crear una ruta de imagen segura.");

  return `products/${productSegment}/${crypto.randomUUID()}.${objectExtensionsByMime[mimeType]}`;
}

export function assertProductImageObjectKey(objectKey: string): void {
  if (
    objectKey.length > 512 ||
    !/^products\/[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u.test(
      objectKey,
    )
  ) {
    throw new Error("La clave de la imagen no pertenece al espacio seguro de productos.");
  }
}
