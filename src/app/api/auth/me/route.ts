import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { handle, ok, preflight, requireAuth } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// GET /api/auth/me — current user + settings, or 401.
export const GET = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      settings: true,
    },
  });
  if (!user) return ok({ error: "User not found" }, 404);
  return ok({ user });
});
