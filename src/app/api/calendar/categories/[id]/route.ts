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
import { categoryUpdateSchema } from "@/lib/calendar/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

async function owned(userId: string, id: string) {
  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) throw new HttpError(404, "Category not found");
  return category;
}

// PATCH /api/calendar/categories/:id
export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  const auth = requireAuth(req);
  const { id } = await params;
  await owned(auth.sub, id);
  const data = await parseBody(req, categoryUpdateSchema);
  const category = await prisma.category.update({ where: { id }, data });
  return ok({ category });
});

// DELETE /api/calendar/categories/:id  (events keep their color, categoryId -> null)
export const DELETE = handle(async (req: NextRequest, { params }: Ctx) => {
  const auth = requireAuth(req);
  const { id } = await params;
  await owned(auth.sub, id);
  await prisma.category.delete({ where: { id } });
  return ok({ ok: true });
});
