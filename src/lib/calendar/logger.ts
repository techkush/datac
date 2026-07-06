// Minimal structured logger. Emits single-line JSON so a self-hosted box can
// pipe stdout to a file or `journald` and later ship to a cloud log sink
// without code changes. Level gated by LOG_LEVEL (debug|info|warn|error).
type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const l = (process.env.LOG_LEVEL || "info").toLowerCase() as Level;
  return ORDER[l] ?? ORDER.info;
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({
    level,
    msg,
    ...(meta || {}),
    // Time is stamped by the runtime writer; avoid Date in shared code paths
    // that must stay deterministic elsewhere. Here it's fine at the edge.
    t: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
