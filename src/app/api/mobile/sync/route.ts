import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  handle,
  ok,
  parseBody,
  preflight,
  requireAuth,
} from "@/lib/calendar/http";
import { batchSyncSchema } from "@/lib/calendar/schemas";
import { applyStatus } from "@/lib/calendar/status";
import { log } from "@/lib/calendar/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// POST /api/mobile/sync — batch reconcile changes captured on the device
// (statuses, activity, completed Pomodoro sessions). Each item is applied
// independently; failures are reported per-item so a partial batch still lands.
export const POST = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const data = await parseBody(req, batchSyncSchema);

  const errors: { kind: string; index: number; error: string }[] = [];
  let statusApplied = 0;
  let activityApplied = 0;
  let pomodoroApplied = 0;

  // Status updates
  for (let i = 0; i < (data.statusUpdates?.length ?? 0); i++) {
    const u = data.statusUpdates![i];
    try {
      await applyStatus({
        userId: auth.sub,
        eventId: u.eventId,
        status: u.status,
        source: "MOBILE",
        note: u.note ?? null,
        at: u.at ? new Date(u.at) : undefined,
        actualSecondsDelta: u.actualSecondsDelta,
      });
      statusApplied++;
    } catch (e) {
      errors.push({
        kind: "status",
        index: i,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Activity log
  for (let i = 0; i < (data.activity?.length ?? 0); i++) {
    const a = data.activity![i];
    try {
      // Only attach eventId if it's a concrete row we own.
      let eventId: string | null = null;
      if (a.eventId && !a.eventId.includes("::")) {
        const ev = await prisma.event.findFirst({
          where: { id: a.eventId, userId: auth.sub },
          select: { id: true },
        });
        eventId = ev?.id ?? null;
      }
      await prisma.activityLog.create({
        data: {
          userId: auth.sub,
          eventId,
          type: a.type,
          source: "MOBILE",
          data: (a.data ?? undefined) as object | undefined,
          createdAt: a.at ? new Date(a.at) : undefined,
        },
      });
      activityApplied++;
    } catch (e) {
      errors.push({
        kind: "activity",
        index: i,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Completed Pomodoro sessions
  for (let i = 0; i < (data.pomodoro?.length ?? 0); i++) {
    const p = data.pomodoro![i];
    try {
      let eventId: string | null = null;
      if (p.eventId) {
        const realId = p.eventId.includes("::")
          ? p.eventId.slice(0, p.eventId.indexOf("::"))
          : p.eventId;
        const ev = await prisma.event.findFirst({
          where: { id: realId, userId: auth.sub },
          select: { id: true },
        });
        eventId = ev?.id ?? null;
      }
      await prisma.$transaction(async (tx) => {
        await tx.pomodoroSession.create({
          data: {
            userId: auth.sub,
            eventId,
            workMinutes: p.workMinutes,
            breakMinutes: p.breakMinutes,
            cyclesCompleted: p.cyclesCompleted ?? 0,
            focusSeconds: p.focusSeconds ?? 0,
            startedAt: p.startedAt ? new Date(p.startedAt) : undefined,
            endedAt: p.endedAt ? new Date(p.endedAt) : new Date(),
          },
        });
        if (eventId && (p.focusSeconds ?? 0) > 0) {
          await tx.event.update({
            where: { id: eventId },
            data: { actualSeconds: { increment: p.focusSeconds! } },
          });
        }
      });
      pomodoroApplied++;
    } catch (e) {
      errors.push({
        kind: "pomodoro",
        index: i,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (errors.length) {
    log.warn("mobile sync partial", { userId: auth.sub, errors: errors.length });
  }

  return ok({
    applied: { statusApplied, activityApplied, pomodoroApplied },
    errors,
  });
});
