import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
type GoogleAuth = { token: string | null; refreshed: boolean; expires?: number };

async function googleToken(request: NextRequest): Promise<GoogleAuth> {
  const access = request.cookies.get("dayflow_google_access")?.value;
  if (access) return { token: access, refreshed: false };
  const refresh = request.cookies.get("dayflow_google_refresh")?.value;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!refresh || !clientId || !clientSecret) return { token: null, refreshed: false };
  const result = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refresh, grant_type: "refresh_token" })
  });
  if (!result.ok) return { token: null, refreshed: false };
  const data = await result.json() as { access_token?: string; expires_in?: number };
  return { token: data.access_token ?? null, refreshed: true, expires: data.expires_in ?? 3600 };
}

function withRefreshedCookie(response: NextResponse, token: string | null, expires = 3600) {
  if (token) response.cookies.set("dayflow_google_access", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/calendar", maxAge: Math.max(60, expires - 60) });
  return response;
}

export async function GET(request: NextRequest) {
  const auth = await googleToken(request);
  if (!auth.token) return NextResponse.json({ connected: false, events: [], message: "Connect Google Calendar from Settings to view events." }, { status: 200 });
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 14 * 86400000).toISOString();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.search = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "50" }).toString();
  const result = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` }, cache: "no-store" });
  if (!result.ok) return withRefreshedCookie(NextResponse.json({ connected: true, events: [], message: "Google Calendar could not load events. Reconnect it in Settings." }, { status: result.status === 401 ? 401 : 502 }), auth.refreshed ? auth.token : null, auth.expires);
  const data = await result.json() as { items?: Array<{ id: string; summary?: string; description?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }> };
  return withRefreshedCookie(NextResponse.json({ connected: true, events: data.items ?? [] }), auth.refreshed ? auth.token : null, auth.expires);
}

export async function POST(request: NextRequest) {
  const auth = await googleToken(request);
  if (!auth.token) return NextResponse.json({ error: "Connect Google Calendar from Settings first." }, { status: 401 });
  const body = await request.json().catch(() => null) as { title?: unknown; start?: unknown; end?: unknown; description?: unknown } | null;
  if (!body || typeof body.title !== "string" || !body.title.trim() || body.title.length > 200 || typeof body.start !== "string" || typeof body.end !== "string" || !Number.isFinite(Date.parse(body.start)) || !Number.isFinite(Date.parse(body.end)) || Date.parse(body.end) <= Date.parse(body.start)) {
    return NextResponse.json({ error: "Enter a title and a valid start and end time." }, { status: 400 });
  }
  const event = { summary: body.title.trim(), description: typeof body.description === "string" ? body.description.slice(0, 2000) : undefined, start: { dateTime: body.start }, end: { dateTime: body.end } };
  const result = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) });
  if (!result.ok) return withRefreshedCookie(NextResponse.json({ error: "Google Calendar could not save this event. Reconnect and try again." }, { status: result.status === 401 ? 401 : 502 }), auth.refreshed ? auth.token : null, auth.expires);
  return withRefreshedCookie(NextResponse.json({ event: await result.json() }, { status: 201 }), auth.refreshed ? auth.token : null, auth.expires);
}
