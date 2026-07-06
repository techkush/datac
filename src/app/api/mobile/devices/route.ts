import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  handle,
  ok,
  parseBody,
  preflight,
  requireAuth,
} from "@/lib/calendar/http";
import { deviceRegisterSchema } from "@/lib/calendar/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// GET /api/mobile/devices — the caller's registered push devices.
export const GET = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const devices = await prisma.device.findMany({
    where: { userId: auth.sub },
    select: { id: true, platform: true, name: true, lastSeenAt: true, createdAt: true },
    orderBy: { lastSeenAt: "desc" },
  });
  return ok({ devices });
});

// POST /api/mobile/devices — register/refresh an FCM token (idempotent by token).
export const POST = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const data = await parseBody(req, deviceRegisterSchema);
  const device = await prisma.device.upsert({
    where: { fcmToken: data.fcmToken },
    create: {
      userId: auth.sub,
      fcmToken: data.fcmToken,
      platform: data.platform,
      name: data.name ?? null,
    },
    update: {
      userId: auth.sub, // reassign if the same token moved to this user
      platform: data.platform,
      name: data.name ?? null,
      lastSeenAt: new Date(),
    },
    select: { id: true, platform: true, name: true, lastSeenAt: true },
  });
  return ok({ device }, 201);
});

// DELETE /api/mobile/devices?token=...  — unregister on logout/uninstall.
export const DELETE = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return ok({ ok: true });
  await prisma.device.deleteMany({
    where: { userId: auth.sub, fcmToken: token },
  });
  return ok({ ok: true });
});
