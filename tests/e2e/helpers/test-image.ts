import { deflateSync } from "node:zlib";

// A deterministic, visibly patterned landscape PNG for gallery/zoom review.
export function testImage(): Buffer {
  const crc = (data: Buffer) => {
    let value = 0xffffffff;
    for (const byte of data) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const content = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(content));
    return Buffer.concat([length, content, checksum]);
  };
  const width = 800, height = 600;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      const board = x > 100 && x < 700 && y > 100 && y < 500;
      const detail = board && (Math.floor(x / 40) + Math.floor(y / 40)) % 3 === 0;
      pixels[offset] = board ? detail ? 190 : 30 : 245;
      pixels[offset + 1] = board ? detail ? 150 : 100 : 245;
      pixels[offset + 2] = board ? detail ? 60 : 80 : 245;
    }
  }
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
