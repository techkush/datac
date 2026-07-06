// Reminder scheduler. Finds due, unsent reminders and dispatches a push through
// the NotificationSender, then marks them sent and records an ActivityLog entry
// for reports. Runs in-process on the self-hosted server (see instrumentation.ts)
// and is also exposed as an HTTP tick so a cloud deploy can drive it from an
// external cron instead — no code change required to move.
import { prisma } from "@/lib/db/prisma";
import { getSender } from "./notifications";
import { log } from "./logger";
import { format } from "date-fns";

// How far back a reminder can be picked up if the server was asleep at fireAt.
const GRACE_MS = 60 * 60 * 1000; // 1h
const BATCH = 100;

export interface TickResult {
  processed: number;
  dispatched: number;
}

export async function runReminderTick(nowMs?: number): Promise<TickResult> {
  const now = nowMs ? new Date(nowMs) : new Date();
  const floor = new Date(now.getTime() - GRACE_MS);

  const due = await prisma.reminder.findMany({
    where: { sentAt: null, fireAt: { lte: now, gte: floor } },
    include: {
      event: { select: { id: true, title: true, startsAt: true, status: true } },
      user: { select: { id: true } },
    },
    take: BATCH,
    orderBy: { fireAt: "asc" },
  });

  if (due.length === 0) return { processed: 0, dispatched: 0 };

  const sender = await getSender();
  let dispatched = 0;

  for (const r of due) {
    // Cancelled events shouldn't nag.
    if (r.event.status === "CANCELLED") {
      await prisma.reminder.update({
        where: { id: r.id },
        data: { sentAt: now },
      });
      continue;
    }

    const devices = await prisma.device.findMany({
      where: { userId: r.userId },
      select: { fcmToken: true },
    });
    const tokens = devices.map((d) => d.fcmToken);

    const when = format(new Date(r.event.startsAt), "EEE d MMM, HH:mm");
    const result = await sender.send(tokens, {
      title: r.event.title,
      body:
        r.minutesBefore === 0
          ? `Starting now — ${when}`
          : `In ${r.minutesBefore} min — ${when}`,
      data: { eventId: r.event.id, type: "reminder" },
    });

    await prisma.$transaction([
      prisma.reminder.update({ where: { id: r.id }, data: { sentAt: now } }),
      prisma.activityLog.create({
        data: {
          userId: r.userId,
          eventId: r.event.id,
          type: "reminder_dispatched",
          source: "SYSTEM",
          data: {
            minutesBefore: r.minutesBefore,
            mode: sender.mode,
            devices: tokens.length,
            sent: result.sent,
          },
        },
      }),
    ]);
    dispatched++;
  }

  log.info("scheduler:tick", { processed: due.length, dispatched });
  return { processed: due.length, dispatched };
}

// In-process loop. Guarded so Next dev's double-invoke / HMR can't start two.
const g = globalThis as unknown as { __datacScheduler?: NodeJS.Timeout };

export function startScheduler(intervalMs = 60_000) {
  if (g.__datacScheduler) return;
  log.info("scheduler:start", { intervalMs });
  g.__datacScheduler = setInterval(() => {
    runReminderTick().catch((e) =>
      log.error("scheduler tick failed", {
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }, intervalMs);
  // Don't keep the process alive solely for the timer.
  g.__datacScheduler.unref?.();
}
