// Next.js instrumentation hook — runs once when the server process starts.
// We use it to launch the in-process reminder scheduler on the self-hosted
// server. Set DISABLE_IN_PROCESS_SCHEDULER=1 (e.g. on a cloud deploy that drives
// the /api/calendar/scheduler/tick endpoint from an external cron) to opt out.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_IN_PROCESS_SCHEDULER === "1") return;
  const { startScheduler } = await import("./lib/calendar/scheduler");
  startScheduler();
}
