import { getRequestId, requestIdHeaders } from "@/lib/observability";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const requestId = getRequestId(request);
  return Response.json(
    { status: "ok" },
    {
      headers: {
        ...requestIdHeaders(requestId),
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
