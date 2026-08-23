export const MAX_XLSX_BYTES = 8 * 1024 * 1024;
export const MAX_XLSX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_XLSX_ROWS = 2_000;
export const MAX_XLSX_SHEETS = 5;
export const MAX_XLSX_COLUMNS = 64;
export const MAX_XLSX_ZIP_ENTRIES = 500;

const allowedMimeTypes = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
  "application/zip",
]);

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

export function assertSafeXlsxFile(file: File, bytes: Uint8Array): void {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Solo se permiten archivos .xlsx.");
  }
  if (!allowedMimeTypes.has(file.type || "application/octet-stream")) {
    throw new Error("El MIME del archivo no corresponde a un XLSX permitido.");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_XLSX_BYTES) {
    throw new Error("El XLSX debe pesar entre 1 byte y 8 MB.");
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error("El archivo no contiene la firma ZIP requerida por XLSX.");
  }

  const lowerBound = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= lowerBound; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("El contenedor XLSX está incompleto o dañado.");

  const entryCount = readUint16(bytes, endOffset + 10);
  const centralDirectoryOffset = readUint32(bytes, endOffset + 16);
  if (entryCount < 1 || entryCount > MAX_XLSX_ZIP_ENTRIES) {
    throw new Error("El XLSX contiene una cantidad anómala de entradas internas.");
  }

  let offset = centralDirectoryOffset;
  let compressedTotal = 0;
  let uncompressedTotal = 0;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 46 > bytes.length || readUint32(bytes, offset) !== 0x02014b50) {
      throw new Error("El directorio interno del XLSX está dañado.");
    }
    const flags = readUint16(bytes, offset + 8);
    if ((flags & 0x1) !== 0) throw new Error("No se aceptan XLSX cifrados.");
    const compressed = readUint32(bytes, offset + 20);
    const uncompressed = readUint32(bytes, offset + 24);
    compressedTotal += compressed;
    uncompressedTotal += uncompressed;
    if (uncompressedTotal > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new Error("El XLSX expandido supera el límite seguro de 50 MB.");
    }
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  if (compressedTotal > 0 && uncompressedTotal / compressedTotal > 100) {
    throw new Error("El XLSX presenta una relación de compresión anómala.");
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const stableBytes = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", stableBytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
