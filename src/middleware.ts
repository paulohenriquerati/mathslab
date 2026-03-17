import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

/* ─── Admin cookie guard (unchanged) ──────────────────── */
const ADMIN_COOKIE = "admin_session";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

function isValidAdminCookie(value: string | undefined): boolean {
  if (!value || !ADMIN_SECRET) return false;
  return value === ADMIN_SECRET;
}

/* ─── Public routes (no Clerk session required) ────────── */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/auth/callback(.*)",
  "/api/check-name(.*)",
  "/api/sessions(.*)",
  "/api/stats(.*)",
  // Admin auth endpoint must be public so the login form can POST
  "/api/admin/auth(.*)",
  "/admin/login(.*)",
]);

/* ─── Admin-protected routes ───────────────────────────── */
const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin(.*)",
]);

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { pathname } = request.nextUrl;

  // Admin guard — cookie-based (separate from Clerk)
  if (isAdminRoute(request)) {
    // Always allow login page and auth endpoint through
    if (pathname === "/admin/login" || pathname === "/api/admin/auth") {
      return NextResponse.next();
    }
    const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
    if (!isValidAdminCookie(cookie)) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // For non-public routes, require Clerk auth
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
