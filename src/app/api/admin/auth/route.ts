import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE = "admin_session";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

/** POST  /api/admin/auth  — login with secret */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const secret =
    typeof body === "object" && body !== null && "secret" in body
      ? String((body as Record<string, unknown>).secret)
      : "";

  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, ADMIN_SECRET, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 8-hour session
    maxAge: 60 * 60 * 8,
    // secure in production
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

/** DELETE /api/admin/auth  — logout */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
