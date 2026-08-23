import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Next 16's proxy.ts is Node-only. OpenNext currently supports the legacy Edge
// middleware convention, so this file intentionally remains middleware.ts.
// The database-backed session check in /admin/layout.tsx is the security boundary.
export function middleware(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};

