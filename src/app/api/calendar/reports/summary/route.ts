import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { handle, ok, preflight, requireAuth } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

const DAY = 86_400_000;

// GET /api/calendar/reports/summary?from=ISO&to=ISO
// Aggregates for the reports view: status breakdown, focus time, Pomodoro
// counts, completion rate. Counts concrete event rows scheduled in the window.
export const GET = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const now = new Date();
  const from = new Date(req.nextUrl.searchParams.get("from") || now.getTime() - 30 * DAY);
  const to = new Date(req.nextUrl.searchParams.get("to") || now.getTime());

  const [byStatus, pomo, focusEvents, sessions] = await Promise.all([
    prisma.event.groupBy({
      by: ["status"],
      where: { userId: auth.sub, startsAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    prisma.pomodoroSession.aggregate({
      where: { userId: auth.sub, startedAt: { gte: from, lte: to } },
      _sum: { focusSeconds: true, cyclesCompleted: true },
      _count: { _all: true },
    }),
    prisma.event.aggregate({
      where: { userId: auth.sub, startsAt: { gte: from, lte: to } },
      _sum: { actualSeconds: true },
    }),
    prisma.pomodoroSession.count({
      where: { userId: auth.sub, startedAt: { gte: from, lte: to }, endedAt: { not: null } },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  let total = 0;
  for (const row of byStatus) {
    statusCounts[row.status] = row._count._all;
    total += row._count._all;
  }
  const completed = statusCounts["COMPLETED"] || 0;
  const missed = statusCounts["MISSED"] || 0;
  const finished = completed + missed;

  return ok({
    range: { from: from.toISOString(), to: to.toISOString() },
    totalEvents: total,
    statusCounts,
    completed,
    completionRate: finished > 0 ? Math.round((completed / finished) * 100) : null,
    focusSeconds:
      (pomo._sum.focusSeconds ?? 0) || (focusEvents._sum.actualSeconds ?? 0),
    pomodoroSessions: pomo._count._all,
    pomodoroCompleted: sessions,
    cyclesCompleted: pomo._sum.cyclesCompleted ?? 0,
  });
});
