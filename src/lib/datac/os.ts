import { execFile } from "child_process";

// Open a path in the OS file manager / default app.
export function osOpen(target: string) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer"
        : "xdg-open";
  execFile(cmd, [target], () => {});
}

// macOS native file picker → resolves the chosen absolute path (no copy).
export function pickFile(): Promise<
  { path: string; name: string } | { cancelled: true } | { error: string }
> {
  return new Promise((resolve) => {
    if (process.platform !== "darwin") {
      resolve({ error: "picker only on macOS" });
      return;
    }
    execFile(
      "osascript",
      ["-e", "POSIX path of (choose file)"],
      (err, stdout) => {
        const p = (stdout || "").trim();
        if (err || !p) {
          resolve({ cancelled: true });
          return;
        }
        resolve({ path: p, name: p.split("/").pop() || p });
      },
    );
  });
}
