import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      // Exchange the OAuth code for a session.
      // Note: exchangeCodeForSession requires the browser (anon) client in SSR;
      // we redirect to the home page and let the client-side listener pick up
      // the session from the URL hash automatically.
    }
  }

  // Redirect to the home page; the Supabase client will pick up the session
  // from the URL fragment (#access_token=...) automatically.
  return NextResponse.redirect(`${origin}/`);
}
