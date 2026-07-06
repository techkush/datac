import { NextRequest } from "next/server";
import { AUTH_COOKIE, handle, ok, preflight } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// POST /api/auth/logout — clear the web session cookie.
export const POST = handle(async (_req: NextRequest) => {
  const res = ok({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
