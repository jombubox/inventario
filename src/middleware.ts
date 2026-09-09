import { type NextRequest, NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE } from "@/features/auth/constants";

// Next 16's proxy.ts is Node-only. OpenNext currently supports the legacy Edge
// middleware convention, so this file intentionally remains middleware.ts.
// The signed session check in requireAdmin() is the security boundary.
export function middleware(request: NextRequest) {
  if (
    !request.cookies.has(ADMIN_SESSION_COOKIE)
  ) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
