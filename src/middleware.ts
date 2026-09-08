import { type NextRequest, NextResponse } from "next/server";

import {
  ENV_ADMIN_SECURE_SESSION_COOKIE,
  ENV_ADMIN_SESSION_COOKIE,
} from "@/features/auth/domain/env-admin-session";

// Next 16's proxy.ts is Node-only. OpenNext currently supports the legacy Edge
// middleware convention, so this file intentionally remains middleware.ts.
// The signed session check in the authorization DAL is the security boundary.
export function middleware(request: NextRequest) {
  if (
    !request.cookies.has(ENV_ADMIN_SESSION_COOKIE) &&
    !request.cookies.has(ENV_ADMIN_SECURE_SESSION_COOKIE)
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
