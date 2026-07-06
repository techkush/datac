import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  handle,
  ok,
  parseBody,
  preflight,
  requireAuth,
} from "@/lib/calendar/http";
import { statusUpdateSchema, serializeEvent } from "@/lib/calendar/schemas";
import { applyStatus } from "@/lib/calendar/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

// POST /api/mobile/events/:id/status — the Flutter app reports a status change
// (:id may be a "master::ISO" occurrence id). Records history + completion time.
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const auth = requireAuth(req);
  const { id } = await params;
  const data = await parseBody(req, statusUpdateSchema);

  const { id: realId } = await applyStatus({
    userId: auth.sub,
    eventId: id,
    status: data.status,
    source: "MOBILE",
    note: data.note ?? null,
    at: data.at ? new Date(data.at) : undefined,
    actualSecondsDelta: data.actualSecondsDelta,
  });

  const event = await prisma.event.findUnique({
    where: { id: realId },
    include: { reminders: true },
  });
  return ok({ event: event ? serializeEvent(event) : null });
});
