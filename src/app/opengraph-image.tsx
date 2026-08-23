import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

export const alt = "JombuBox · Catálogo técnico de refacciones electrónicas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const logoData = await readFile(join(process.cwd(), "public", "logo.svg"), "base64");
const logoSrc = `data:image/svg+xml;base64,${logoData}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#FCFCFC",
          color: "#000F30",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "linear-gradient(rgba(47,115,242,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(47,115,242,0.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -190,
            right: -120,
            display: "flex",
            width: 520,
            height: 520,
            borderRadius: 260,
            background: "#2F73F2",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 100,
            bottom: -210,
            display: "flex",
            width: 470,
            height: 470,
            borderRadius: 235,
            background: "#46C4FF",
            opacity: 0.72,
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 850,
            padding: "76px 84px",
          }}
        >
          {/* ImageResponse renders its own image tree and cannot use next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="JombuBox" width={700} height={150} />
          <div
            style={{
              display: "flex",
              width: 92,
              height: 8,
              marginTop: 46,
              borderRadius: 999,
              background: "#2F73F2",
            }}
          />
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 42,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Catálogo técnico
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 720,
              marginTop: 16,
              color: "#141414",
              fontSize: 28,
              lineHeight: 1.35,
            }}
          >
            Refacciones electrónicas identificadas con precisión.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
