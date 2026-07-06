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
import { pomodoroUpdateSchema } from "@/lib/calendar/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/calendar/pomodoro/sessions/:id — accrue progress; `ended:true`
// finalizes and rolls the session's focus time into the linked event.
export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  const auth = requireAuth(req);
  const { id } = await params;
  const data = await parseBody(req, pomodoroUpdateSchema);

  const session = await prisma.pomodoroSession.findFirst({
    where: { id, userId: auth.sub },
  });
  if (!session) throw new HttpError(404, "Session not found");

  const alreadyEnded = !!session.endedAt;
  const finalize = data.ended && !alreadyEnded;
  const focusSeconds = data.focusSeconds ?? session.focusSeconds;

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.pomodoroSession.update({
      where: { id },
      data: {
        cyclesCompleted: data.cyclesCompleted ?? session.cyclesCompleted,
        focusSeconds,
        endedAt: finalize ? new Date() : session.endedAt,
      },
    });

    if (finalize && session.eventId && focusSeconds > 0) {
      await tx.event.update({
        where: { id: session.eventId },
        data: { actualSeconds: { increment: focusSeconds } },
      });
      await tx.activityLog.create({
        data: {
          userId: auth.sub,
          eventId: session.eventId,
          type: "pomodoro_completed",
          source: "WEB",
          data: {
            focusSeconds,
            cyclesCompleted: s.cyclesCompleted,
          },
        },
      });
    }
    return s;
  });

  return ok({ session: updated });
});
