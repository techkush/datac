import { NextRequest } from "next/server";
import { handle, ok, preflight, getAuth, HttpError } from "@/lib/calendar/http";
import { runReminderTick } from "@/lib/calendar/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// POST /api/calendar/scheduler/tick
// Runs one reminder pass. Authorized by a logged-in user OR a shared secret
// (X-Scheduler-Secret == SCHEDULER_SECRET) so an external cron can drive it in
// a cloud deployment where the in-process scheduler is disabled.
export const POST = handle(async (req: NextRequest) => {
  const secret = process.env.SCHEDULER_SECRET;
  const provided = req.headers.get("x-scheduler-secret");
  const authed = !!getAuth(req) || (!!secret && provided === secret);
  if (!authed) throw new HttpError(401, "Not authorized");

  const result = await runReminderTick();
  return ok(result);
});
