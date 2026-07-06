import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { signToken, verifyPassword } from "@/lib/calendar/auth";
import {
  AUTH_COOKIE,
  HttpError,
  handle,
  ok,
  parseBody,
  preflight,
} from "@/lib/calendar/http";
import { loginSchema } from "@/lib/calendar/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// POST /api/auth/login — exchange email+password for a JWT (also set as an
// httpOnly cookie for the web app; the token is returned for mobile/Bearer use).
export const POST = handle(async (req: NextRequest) => {
  const { email, password } = await parseBody(req, loginSchema);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  const token = signToken({ sub: user.id, email: user.email, role: user.role });

  const res = ok({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
});
