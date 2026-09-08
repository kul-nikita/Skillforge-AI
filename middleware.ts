import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

/**
 * Middleware runs on the Edge runtime, so it cannot reach Mongo to validate a
 * session. It only does the cheap redirect for a missing cookie; the real
 * lookup happens in the page/route via `requireUser()`. A forged cookie gets
 * past here and is rejected there.
 */
export function middleware(request: NextRequest) {
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = request.nextUrl;

  if (!hasCookie) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*",
    "/evidence/:path*",
    "/diagnostic/:path*",
    "/account/:path*",
    "/onboarding/:path*",
    "/gap-analyzer/:path*",
    "/match-score/:path*",
    "/graph/:path*",
    "/admin/:path*"]
};
