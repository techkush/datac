// Shared HTTP plumbing for the calendar/mobile API: auth extraction, uniform
// JSON error handling, and CORS for the Flutter client. Existing datac routes
// are untouched — this only wraps the new /api/(auth|calendar|mobile) routes.
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { verifyToken, type TokenPayload } from "./auth";
import { log } from "./logger";

export const AUTH_COOKIE = "datac_token";

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// --- CORS ------------------------------------------------------------------
function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  const allow = allowedOrigins();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && (allow.includes(origin) || allow.includes("*"))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  }
  return headers;
}

function applyCors(req: NextRequest, res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
  return res;
}

export function preflight(req: NextRequest): NextResponse {
  return applyCors(req, new NextResponse(null, { status: 204 }));
}

// --- Auth ------------------------------------------------------------------
export function getAuth(req: NextRequest): TokenPayload | null {
  const header = req.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : null;
  const token = bearer || req.cookies.get(AUTH_COOKIE)?.value || null;
  return token ? verifyToken(token) : null;
}

export function requireAuth(req: NextRequest): TokenPayload {
  const auth = getAuth(req);
  if (!auth) throw new HttpError(401, "Authentication required");
  return auth;
}

// --- Body parsing / validation ---------------------------------------------
export async function parseBody<T>(
  req: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(422, "Validation failed", result.error.flatten());
  }
  return result.data;
}

// --- Handler wrapper -------------------------------------------------------
type Handler<C> = (req: NextRequest, ctx: C) => Promise<NextResponse> | NextResponse;

export function handle<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      const res = await fn(req, ctx);
      return applyCors(req, res);
    } catch (err) {
      return applyCors(req, toErrorResponse(req, err));
    }
  };
}

function toErrorResponse(req: NextRequest, err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: err.message, details: err.details },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: err.flatten() },
      { status: 422 },
    );
  }
  log.error("Unhandled API error", {
    path: req.nextUrl.pathname,
    method: req.method,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
