import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const refresh = request.cookies.get("dayflow_google_refresh")?.value;
  if (refresh) {
    await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refresh }) }).catch(() => {});
  }
  const response = NextResponse.json({ disconnected: true });
  response.cookies.set("dayflow_google_access", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/calendar", maxAge: 0 });
  response.cookies.set("dayflow_google_refresh", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/calendar", maxAge: 0 });
  return response;
}
