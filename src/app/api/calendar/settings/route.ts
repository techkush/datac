import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  handle,
  ok,
  parseBody,
  preflight,
  requireAuth,
} from "@/lib/calendar/http";
import { settingsUpdateSchema } from "@/lib/calendar/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// GET /api/calendar/settings — current user settings (creates defaults if none).
export const GET = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const settings = await prisma.userSettings.upsert({
    where: { userId: auth.sub },
    create: { userId: auth.sub },
    update: {},
  });
  return ok({ settings });
});

// PATCH /api/calendar/settings — update (Pomodoro durations, week start, tz…).
export const PATCH = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const data = await parseBody(req, settingsUpdateSchema);
  const settings = await prisma.userSettings.upsert({
    where: { userId: auth.sub },
    create: { userId: auth.sub, ...data },
    update: data,
  });
  return ok({ settings });
});
