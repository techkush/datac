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
import { eventUpdateSchema, serializeEvent } from "@/lib/calendar/schemas";
import { reminderCreateData } from "@/lib/calendar/events";
import { parseOccurrenceId } from "@/lib/calendar/recurrence";
import type { Prisma } from "@/generated/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };
type Scope = "occurrence" | "all";

async function master(userId: string, id: string) {
  const ev = await prisma.event.findFirst({
    where: { id, userId },
    include: { reminders: true },
  });
  if (!ev) throw new HttpError(404, "Event not found");
  return ev;
}

function scopeOf(req: NextRequest, isOccurrence: boolean): Scope {
  const q = req.nextUrl.searchParams.get("scope");
  if (q === "occurrence" || q === "all") return q;
  return isOccurrence ? "occurrence" : "all";
}

// GET /api/calendar/events/:id  (:id may be a composite occurrence id)
export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  const auth = requireAuth(req);
  const { id } = await params;
  const occ = parseOccurrenceId(id);
  const realId = occ ? occ.masterId : id;
  const ev = await master(auth.sub, realId);
  if (occ) {
    const dur = ev.endsAt.getTime() - ev.startsAt.getTime();
    const start = occ.originalStart;
    return ok({
      event: {
        ...serializeEvent(ev),
        id,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + dur).toISOString(),
        recurrenceParentId: ev.id,
        originalStart: start.toISOString(),
      },
    });
  }
  return ok({ event: serializeEvent(ev) });
});

// PATCH /api/calendar/events/:id
export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  const auth = requireAuth(req);
  const { id } = await params;
  const data = await parseBody(req, eventUpdateSchema);
  const occ = parseOccurrenceId(id);
  const scope = scopeOf(req, !!occ);

  if (data.categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: data.categoryId, userId: auth.sub },
    });
    if (!cat) throw new HttpError(422, "Unknown categoryId");
  }

  // --- Editing a single occurrence of a series -> create/update an override.
  if (occ && scope === "occurrence") {
    const m = await master(auth.sub, occ.masterId);
    const dur = m.endsAt.getTime() - m.startsAt.getTime();
    const startsAt = data.startsAt
      ? new Date(data.startsAt)
      : occ.originalStart;
    const endsAt = data.endsAt
      ? new Date(data.endsAt)
      : new Date(occ.originalStart.getTime() + dur);
    if (endsAt < startsAt) throw new HttpError(422, "endsAt must be >= startsAt");

    const status = data.status ?? m.status;
    const base = {
      userId: auth.sub,
      title: data.title ?? m.title,
      description: data.description ?? m.description,
      notes: data.notes ?? m.notes,
      location: data.location ?? m.location,
      startsAt,
      endsAt,
      allDay: data.allDay ?? m.allDay,
      timezone: data.timezone ?? m.timezone,
      color: data.color ?? m.color,
      categoryId: data.categoryId ?? m.categoryId,
      status,
      isTimeBlock: data.isTimeBlock ?? m.isTimeBlock,
      recurrenceParentId: m.id,
      originalStart: occ.originalStart,
      recurrenceRule: null,
    };

    const existing = await prisma.event.findFirst({
      where: {
        recurrenceParentId: m.id,
        originalStart: occ.originalStart,
        userId: auth.sub,
      },
    });

    const reminderWrite =
      data.reminders !== undefined
        ? {
            deleteMany: {},
            create: data.reminders.map((r) =>
              reminderCreateData(r, startsAt, auth.sub),
            ),
          }
        : existing
          ? undefined
          : {
              create: m.reminders.map((r) =>
                reminderCreateData(
                  { minutesBefore: r.minutesBefore, method: r.method },
                  startsAt,
                  auth.sub,
                ),
              ),
            };

    const child = existing
      ? await prisma.event.update({
          where: { id: existing.id },
          data: {
            ...base,
            ...(reminderWrite ? { reminders: reminderWrite } : {}),
            statusHistory: {
              create: { userId: auth.sub, status, source: "WEB" },
            },
          },
          include: { reminders: true },
        })
      : await prisma.event.create({
          data: {
            ...base,
            reminders: reminderWrite as Prisma.ReminderCreateNestedManyWithoutEventInput,
            statusHistory: {
              create: { userId: auth.sub, status, source: "WEB" },
            },
          },
          include: { reminders: true },
        });

    return ok({ event: serializeEvent(child) });
  }

  // --- Editing a plain event or the whole series -> update the row.
  const realId = occ ? occ.masterId : id;
  const current = await master(auth.sub, realId);

  const startsAt = data.startsAt ? new Date(data.startsAt) : current.startsAt;
  const endsAt = data.endsAt ? new Date(data.endsAt) : current.endsAt;
  if (endsAt < startsAt) throw new HttpError(422, "endsAt must be >= startsAt");

  const update: Prisma.EventUpdateInput = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.location !== undefined) update.location = data.location;
  if (data.startsAt !== undefined) update.startsAt = startsAt;
  if (data.endsAt !== undefined) update.endsAt = endsAt;
  if (data.allDay !== undefined) update.allDay = data.allDay;
  if (data.timezone !== undefined) update.timezone = data.timezone;
  if (data.color !== undefined) update.color = data.color;
  if (data.isTimeBlock !== undefined) update.isTimeBlock = data.isTimeBlock;
  if (data.recurrenceRule !== undefined)
    update.recurrenceRule = data.recurrenceRule;
  if (data.categoryId !== undefined) {
    update.category = data.categoryId
      ? { connect: { id: data.categoryId } }
      : { disconnect: true };
  }

  if (data.status !== undefined && data.status !== current.status) {
    update.status = data.status;
    update.completedAt = data.status === "COMPLETED" ? new Date() : null;
    update.statusHistory = {
      create: { userId: auth.sub, status: data.status, source: "WEB" },
    };
  }

  if (data.reminders !== undefined) {
    await prisma.reminder.deleteMany({ where: { eventId: realId } });
    if (data.reminders.length) {
      update.reminders = {
        create: data.reminders.map((r) =>
          reminderCreateData(r, startsAt, auth.sub),
        ),
      };
    }
  }

  const event = await prisma.event.update({
    where: { id: realId },
    data: update,
    include: { reminders: true },
  });
  return ok({ event: serializeEvent(event) });
});

// DELETE /api/calendar/events/:id
export const DELETE = handle(async (req: NextRequest, { params }: Ctx) => {
  const auth = requireAuth(req);
  const { id } = await params;
  const occ = parseOccurrenceId(id);
  const scope = scopeOf(req, !!occ);

  if (occ && scope === "occurrence") {
    const m = await master(auth.sub, occ.masterId);
    // Skip this occurrence (EXDATE) and remove any override that replaced it.
    await prisma.$transaction([
      prisma.recurrenceException.upsert({
        where: {
          eventId_originalStart: {
            eventId: m.id,
            originalStart: occ.originalStart,
          },
        },
        create: { eventId: m.id, originalStart: occ.originalStart },
        update: {},
      }),
      prisma.event.deleteMany({
        where: {
          recurrenceParentId: m.id,
          originalStart: occ.originalStart,
          userId: auth.sub,
        },
      }),
    ]);
    return ok({ ok: true });
  }

  const realId = occ ? occ.masterId : id;
  await master(auth.sub, realId); // ownership check
  await prisma.event.delete({ where: { id: realId } });
  return ok({ ok: true });
});
