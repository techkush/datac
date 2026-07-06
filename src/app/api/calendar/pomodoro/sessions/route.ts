import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  HttpError,
  handle,
  ok,
  parseBody,
  preflight,
  requireAuth,
} from "@/lib/calendar/http";
import { pomodoroCreateSchema } from "@/lib/calendar/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// POST /api/calendar/pomodoro/sessions — start a session (optionally tied to an
// event or a specific occurrence, whose master id is used for record-keeping).
export const POST = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const data = await parseBody(req, pomodoroCreateSchema);

  let eventId: string | null = null;
  if (data.eventId) {
    // Occurrence ids look like "master::ISO"; store against the master row.
    const realId = data.eventId.includes("::")
      ? data.eventId.slice(0, data.eventId.indexOf("::"))
      : data.eventId;
    const ev = await prisma.event.findFirst({
      where: { id: realId, userId: auth.sub },
      select: { id: true },
    });
    if (!ev) throw new HttpError(422, "Unknown eventId");
    eventId = ev.id;
  }

  const session = await prisma.pomodoroSession.create({
    data: {
      userId: auth.sub,
      eventId,
      workMinutes: data.workMinutes,
      breakMinutes: data.breakMinutes,
      cyclesPlanned: data.cyclesPlanned ?? null,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: auth.sub,
      eventId,
      type: "pomodoro_started",
      source: "WEB",
      data: { workMinutes: data.workMinutes, breakMinutes: data.breakMinutes },
    },
  });

  return ok({ session }, 201);
});
