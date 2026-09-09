import { logServerEvent } from "@/lib/observability";

export class InvalidRequestOriginError extends Error {
  override readonly name = "InvalidRequestOriginError";
}

export function assertSameOriginMutation(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new InvalidRequestOriginError("Cross-site mutation rejected.");
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    if (request.headers.get("sec-fetch-site") === "same-origin") return;
    logServerEvent("warn", "mutation_origin_rejected", {
      reason: "missing_origin",
      requestUrl: request.url,
      host: request.headers.get("host"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    });
    throw new InvalidRequestOriginError("Mutation origin is required.");
  }
  const requestHost = new URL(request.url).host;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = request.headers.get("host")?.trim();
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new InvalidRequestOriginError("Request origin is invalid.");
  }
  const allowedHosts = new Set(
    [requestHost, forwardedHost, host]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  );
  if (!allowedHosts.has(originHost.toLowerCase())) {
    logServerEvent("warn", "mutation_origin_rejected", {
      reason: "host_mismatch",
      originHost,
      requestHost,
      host,
      forwardedHost,
      forwardedProto: request.headers.get("x-forwarded-proto"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    });
    throw new InvalidRequestOriginError("Cross-origin mutation rejected.");
  }
}
