import os from "os";
import path from "path";

// ~/.datac holds the global registry the `datac` CLI maintains.
export const DATAC_HOME =
  process.env.DATAC_HOME || path.join(os.homedir(), ".datac");

export const REGISTRY = path.join(DATAC_HOME, "workspaces.json");

// Port the daemon listens on (kept identical to the legacy default).
export const PORT = Number(
  process.env.DATAC_PORT || process.env.PORT || 4321,
);
