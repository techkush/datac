// Applies an event status change from any client (web PATCH, mobile sync).
// Handles recurring occurrences by materializing an override child so a single
// instance can carry its own status/completion without affecting the series.
import { prisma } from "@/lib/db/prisma";
import { HttpError } from "./http";
import { parseOccurrenceId } from "./recurrence";
import type { EventStatus } from "./constants";

interface ApplyArgs {
  userId: string;
  eventId: string;
  status: EventStatus;
  source: "WEB" | "MOBILE" | "SYSTEM";
  note?: string | null;
  at?: Date;
  actualSecondsDelta?: number;
}

export async function applyStatus(args: ApplyArgs): Promise<{ id: string }> {
  const { userId, eventId, status, source, note, at, actualSecondsDelta } = args;
  const when = at ?? new Date();
  const completedAt = status === "COMPLETED" ? when : null;
  const incr = actualSecondsDelta && actualSecondsDelta > 0 ? actualSecondsDelta : 0;

  const occ = parseOccurrenceId(eventId);

  if (occ) {
    const master = await prisma.event.findFirst({
      where: { id: occ.masterId, userId },
    });
    if (!master) throw new HttpError(404, "Event not found");
    const dur = master.endsAt.getTime() - master.startsAt.getTime();

    const existing = await prisma.event.findFirst({
      where: {
        recurrenceParentId: master.id,
        originalStart: occ.originalStart,
        userId,
      },
    });

    if (existing) {
      await prisma.event.update({
        where: { id: existing.id },
        data: {
          status,
          completedAt,
          ...(incr ? { actualSeconds: { increment: incr } } : {}),
          statusHistory: {
            create: { userId, status, source, note: note ?? null, createdAt: when },
          },
        },
      });
      return { id: existing.id };
    }

    const child = await prisma.event.create({
      data: {
        userId,
        title: master.title,
        description: master.description,
        notes: master.notes,
        location: master.location,
        startsAt: occ.originalStart,
        endsAt: new Date(occ.originalStart.getTime() + dur),
        allDay: master.allDay,
        timezone: master.timezone,
        color: master.color,
        categoryId: master.categoryId,
        isTimeBlock: master.isTimeBlock,
        recurrenceParentId: master.id,
        originalStart: occ.originalStart,
        status,
        completedAt,
        actualSeconds: incr,
        statusHistory: {
          create: { userId, status, source, note: note ?? null, createdAt: when },
        },
      },
    });
    return { id: child.id };
  }

  const ev = await prisma.event.findFirst({ where: { id: eventId, userId } });
  if (!ev) throw new HttpError(404, "Event not found");

  await prisma.event.update({
    where: { id: eventId },
    data: {
      status,
      completedAt,
      ...(incr ? { actualSeconds: { increment: incr } } : {}),
      statusHistory: {
        create: { userId, status, source, note: note ?? null, createdAt: when },
      },
    },
  });
  return { id: eventId };
}
