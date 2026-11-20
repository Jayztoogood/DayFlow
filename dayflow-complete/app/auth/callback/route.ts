import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/?auth_error=missing_code", origin));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/?auth_error=google_sign_in", origin));

  const response = NextResponse.redirect(new URL("/", origin));
  const secure = request.nextUrl.protocol === "https:";
  if (data.session.provider_token) response.cookies.set("dayflow_google_access", data.session.provider_token, { httpOnly: true, secure, sameSite: "lax", path: "/api/calendar", maxAge: 55 * 60 });
  if (data.session.provider_refresh_token) response.cookies.set("dayflow_google_refresh", data.session.provider_refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/api/calendar", maxAge: 60 * 60 * 24 * 180 });
  return response;
}
