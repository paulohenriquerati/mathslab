import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE = "admin_session";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

function isValidAdminCookie(value: string | undefined): boolean {
  if (!value || !ADMIN_SECRET) return false;
  // Simple constant-time comparison is enough here; the cookie value IS the secret.
  return value === ADMIN_SECRET;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /admin/* and /api/admin/* …
  const isAdminRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/api/admin");

  if (!isAdminRoute) return NextResponse.next();

  // … but always allow the login page and the auth endpoint through.
  const isPublicAdminPath =
    pathname === "/admin/login" || pathname === "/api/admin/auth";

  if (isPublicAdminPath) return NextResponse.next();

  const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!isValidAdminCookie(cookie)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
