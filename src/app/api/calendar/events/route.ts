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
import { eventCreateSchema, serializeEvent } from "@/lib/calendar/schemas";
import { reminderCreateData } from "@/lib/calendar/events";
import { listEventsInRange } from "@/lib/calendar/list-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

const DAY = 86_400_000;

// GET /api/calendar/events?from=ISO&to=ISO
// Returns concrete events overlapping [from, to] plus expanded occurrences of
// any recurring series, with EXDATEs and override children removed.
export const GET = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const { searchParams } = req.nextUrl;
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");

  const now = new Date();
  const from = fromRaw ? new Date(fromRaw) : now;
  const to = toRaw ? new Date(toRaw) : new Date(now.getTime() + 90 * DAY);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new HttpError(400, "Invalid from/to date");
  }

  const events = await listEventsInRange(auth.sub, from, to);
  return ok({ events });
});

// POST /api/calendar/events
export const POST = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const data = await parseBody(req, eventCreateSchema);

  if (data.categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: data.categoryId, userId: auth.sub },
    });
    if (!cat) throw new HttpError(422, "Unknown categoryId");
  }

  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);

  const event = await prisma.event.create({
    data: {
      userId: auth.sub,
      title: data.title,
      description: data.description ?? null,
      notes: data.notes ?? null,
      location: data.location ?? null,
      startsAt,
      endsAt,
      allDay: data.allDay,
      timezone: data.timezone,
      color: data.color ?? null,
      categoryId: data.categoryId ?? null,
      status: data.status,
      isTimeBlock: data.isTimeBlock,
      recurrenceRule: data.recurrenceRule ?? null,
      statusHistory: {
        create: { userId: auth.sub, status: data.status, source: "WEB" },
      },
      reminders: data.reminders?.length
        ? {
            create: data.reminders.map((r) =>
              reminderCreateData(r, startsAt, auth.sub),
            ),
          }
        : undefined,
    },
    include: { reminders: true },
  });

  return ok({ event: serializeEvent(event) }, 201);
});
