import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

function getR2PublicConfiguration(): {
  origin: string | null;
  remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"];
} {
  const value = process.env.R2_PUBLIC_URL?.trim();
  if (!value) return { origin: null, remotePatterns: [] };

  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("R2_PUBLIC_URL must be an HTTP(S) base URL without credentials, query or hash.");
  }
  const basePath = url.pathname.replace(/\/+$/u, "");
  return {
    origin: url.origin,
    remotePatterns: [
      {
        protocol: url.protocol === "https:" ? "https" : "http",
        hostname: url.hostname,
        port: url.port,
        pathname: `${basePath}/**`,
      },
    ],
  };
}

const r2Public = getR2PublicConfiguration();
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const r2UploadOrigin = accountId && /^[a-f0-9]{32}$/iu.test(accountId)
  ? `https://${accountId}.r2.cloudflarestorage.com`
  : process.env.APP_ENV !== "production" && accountId && /^https?:\/\//u.test(accountId)
    ? new URL(accountId).origin : null;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: r2Public.remotePatterns,
    // The disposable Playwright fake R2 is served on loopback; production keeps
    // Next's private-address protection enabled.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development"
      && process.env.JUMBOBOX_LOCAL_IMAGE_TESTS === "true"
      && r2Public.origin === "http://127.0.0.1:5555",
  },
  async headers() {
    const scriptDevelopmentSource = process.env.NODE_ENV === "development"
      ? " 'unsafe-eval'"
      : "";
    const connectDevelopmentSources = process.env.NODE_ENV === "development"
      ? " http: ws:"
      : "";
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          `script-src 'self' 'unsafe-inline'${scriptDevelopmentSource}`,
          "style-src 'self' 'unsafe-inline'",
          `img-src 'self' data: blob:${r2Public.origin ? ` ${r2Public.origin}` : ""}`,
          "font-src 'self' data:",
          `connect-src 'self'${r2UploadOrigin ? ` ${r2UploadOrigin}` : ""}${connectDevelopmentSources}`,
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
          "form-action 'self'",
        ].join("; "),
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ...(process.env.APP_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
    ];

    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        source: "/login",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
};

initOpenNextCloudflareForDev();

export default nextConfig;
