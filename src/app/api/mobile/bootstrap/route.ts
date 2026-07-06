import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { handle, ok, preflight, requireAuth } from "@/lib/calendar/http";
import { listEventsInRange } from "@/lib/calendar/list-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

const DAY = 86_400_000;

// GET /api/mobile/bootstrap?days=30 — one call to hydrate the Flutter app:
// user, settings, categories, and upcoming events (recurrence expanded).
export const GET = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const days = Math.min(
    90,
    Math.max(1, Number(req.nextUrl.searchParams.get("days") || 30)),
  );
  const now = new Date();
  const to = new Date(now.getTime() + days * DAY);

  const [user, settings, categories, events] = await Promise.all([
    prisma.user.findUnique({
      where: { id: auth.sub },
      select: { id: true, email: true, name: true, role: true },
    }),
    prisma.userSettings.upsert({
      where: { userId: auth.sub },
      create: { userId: auth.sub },
      update: {},
    }),
    prisma.category.findMany({
      where: { userId: auth.sub },
      orderBy: { name: "asc" },
    }),
    listEventsInRange(auth.sub, new Date(now.getTime() - DAY), to),
  ]);

  return ok({ user, settings, categories, events, serverTime: now.toISOString() });
});
