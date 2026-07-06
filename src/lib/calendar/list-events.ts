// Shared event listing: concrete events overlapping [from,to] plus expanded
// occurrences of recurring series (EXDATEs and override children removed).
// Used by the web calendar route and the mobile bootstrap.
import { prisma } from "@/lib/db/prisma";
import { serializeEvent, serializeOccurrence, type EventDTO } from "./schemas";
import { expandSeries, occurrenceId } from "./recurrence";

export async function listEventsInRange(
  userId: string,
  from: Date,
  to: Date,
): Promise<EventDTO[]> {
  const concrete = await prisma.event.findMany({
    where: {
      userId,
      recurrenceRule: null,
      startsAt: { lte: to },
      endsAt: { gte: from },
    },
    include: { reminders: true },
    orderBy: { startsAt: "asc" },
  });

  const masters = await prisma.event.findMany({
    where: { userId, recurrenceRule: { not: null }, startsAt: { lte: to } },
    include: { reminders: true, exceptions: true },
  });

  const masterIds = masters.map((m) => m.id);
  const overrides = masterIds.length
    ? await prisma.event.findMany({
        where: { recurrenceParentId: { in: masterIds } },
        select: { recurrenceParentId: true, originalStart: true },
      })
    : [];

  const overridesByMaster = new Map<string, number[]>();
  for (const o of overrides) {
    if (!o.recurrenceParentId || !o.originalStart) continue;
    const arr = overridesByMaster.get(o.recurrenceParentId) || [];
    arr.push(o.originalStart.getTime());
    overridesByMaster.set(o.recurrenceParentId, arr);
  }

  const occurrences = masters.flatMap((m) => {
    const excluded = [
      ...m.exceptions.map((e) => e.originalStart.getTime()),
      ...(overridesByMaster.get(m.id) || []),
    ];
    return expandSeries(
      {
        id: m.id,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        recurrenceRule: m.recurrenceRule!,
      },
      from,
      to,
      excluded,
    ).map((occ) =>
      serializeOccurrence(
        m,
        occurrenceId(m.id, occ.startsAt),
        occ.startsAt,
        occ.endsAt,
      ),
    );
  });

  return [...concrete.map(serializeEvent), ...occurrences].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}
