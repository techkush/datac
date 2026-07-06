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
import { categoryCreateSchema } from "@/lib/calendar/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// GET /api/calendar/categories
export const GET = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const categories = await prisma.category.findMany({
    where: { userId: auth.sub },
    orderBy: { name: "asc" },
  });
  return ok({ categories });
});

// POST /api/calendar/categories
export const POST = handle(async (req: NextRequest) => {
  const auth = requireAuth(req);
  const data = await parseBody(req, categoryCreateSchema);
  const existing = await prisma.category.findUnique({
    where: { userId_name: { userId: auth.sub, name: data.name } },
  });
  if (existing) throw new HttpError(409, "A category with that name exists");
  const category = await prisma.category.create({
    data: { ...data, userId: auth.sub },
  });
  return ok({ category }, 201);
});
