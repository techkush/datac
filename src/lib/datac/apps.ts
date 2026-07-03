import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { DATAC_HOME } from "./paths";

const fsp = fs.promises;

// Standard macOS application folders (plus one utility subfolder level).
export const APP_DIRS = [
  "/Applications",
  "/Applications/Utilities",
  "/System/Applications",
  "/System/Applications/Utilities",
  path.join(os.homedir(), "Applications"),
];

// Cached, converted app icons live here (64px PNGs).
export const APP_ICON_CACHE = path.join(DATAC_HOME, "appicons");

// Installed application names ("Safari", not "Safari.app"), sorted.
export async function listInstalledApps(): Promise<string[]> {
  const names = new Set<string>();
  for (const dir of APP_DIRS) {
    try {
      for (const entry of await fsp.readdir(dir)) {
        if (entry.endsWith(".app") && !entry.startsWith("."))
          names.add(entry.slice(0, -4));
      }
    } catch {}
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

// Absolute bundle path for an installed app name, or null.
export async function findAppBundle(name: string): Promise<string | null> {
  for (const dir of APP_DIRS) {
    const p = path.join(dir, `${name}.app`);
    try {
      await fsp.access(p);
      return p;
    } catch {}
  }
  return null;
}

function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, (err, stdout) =>
      resolve(err ? null : String(stdout).trim()),
    );
  });
}

// Extract the app's icon as a 64px PNG into the cache; returns the PNG path
// or null when the bundle has no usable .icns (some system apps ship their
// icon only in Assets.car).
export async function appIconPng(name: string): Promise<string | null> {
  const cached = path.join(APP_ICON_CACHE, `${name}.png`);
  try {
    await fsp.access(cached);
    return cached;
  } catch {}

  const bundle = await findAppBundle(name);
  if (!bundle) return null;
  const resources = path.join(bundle, "Contents", "Resources");

  // Info.plist names the icon file, usually without the .icns extension.
  let icns: string | null = null;
  const declared = await run("plutil", [
    "-extract",
    "CFBundleIconFile",
    "raw",
    "-o",
    "-",
    path.join(bundle, "Contents", "Info.plist"),
  ]);
  if (declared) {
    const file = declared.endsWith(".icns") ? declared : `${declared}.icns`;
    const p = path.join(resources, file);
    try {
      await fsp.access(p);
      icns = p;
    } catch {}
  }
  if (!icns) {
    try {
      const any = (await fsp.readdir(resources)).find((f) =>
        f.endsWith(".icns"),
      );
      if (any) icns = path.join(resources, any);
    } catch {}
  }
  if (!icns) return null;

  await fsp.mkdir(APP_ICON_CACHE, { recursive: true });
  const ok = await run("sips", [
    "-s",
    "format",
    "png",
    "-Z",
    "64",
    icns,
    "--out",
    cached,
  ]);
  if (ok === null) return null;
  try {
    await fsp.access(cached);
    return cached;
  } catch {
    return null;
  }
}
