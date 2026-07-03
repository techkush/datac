import { NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { DATAC_HOME } from "@/lib/datac/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fsp = fs.promises;

// pix2tex (LaTeX-OCR) CLI — looked up in the dedicated datac venv first.
const PIX2TEX_CANDIDATES = [
  path.join(DATAC_HOME, "ocr-venv", "bin", "pix2tex"),
  "/opt/homebrew/bin/pix2tex",
  "/usr/local/bin/pix2tex",
];

async function findPix2tex(): Promise<string | null> {
  for (const p of PIX2TEX_CANDIDATES) {
    try {
      await fsp.access(p, fs.constants.X_OK);
      return p;
    } catch {}
  }
  return null;
}

function run(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || stderr || "").trim() });
    });
  });
}

// POST { dataUrl } → { latex } — run LaTeX OCR on an equation image.
export async function POST(req: Request) {
  let dataUrl = "";
  try {
    dataUrl = ((await req.json()) as { dataUrl?: string }).dataUrl || "";
  } catch {}
  const m = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,(.+)$/i.exec(dataUrl);
  if (!m)
    return NextResponse.json(
      { error: "expected an image dataUrl" },
      { status: 400 },
    );

  const bin = await findPix2tex();
  if (!bin)
    return NextResponse.json(
      {
        error: "pix2tex is not installed",
        install:
          "python3 -m venv --system-site-packages ~/.datac/ocr-venv && ~/.datac/ocr-venv/bin/pip install pix2tex",
      },
      { status: 501 },
    );

  const tmp = path.join(
    os.tmpdir(),
    `datac-ocr-${crypto.randomBytes(6).toString("hex")}.${m[1] === "jpeg" ? "jpg" : m[1].toLowerCase()}`,
  );
  try {
    await fsp.writeFile(tmp, Buffer.from(m[2], "base64"));
    // First call downloads model weights; allow a generous timeout.
    const r = await run(bin, [tmp], 120_000);
    if (!r.ok)
      return NextResponse.json(
        { error: r.out || "pix2tex failed" },
        { status: 500 },
      );
    // CLI output: "<file>: <latex>" — strip the filename prefix.
    let latex = r.out;
    const idx = latex.indexOf(tmp + ":");
    if (idx >= 0) latex = latex.slice(idx + tmp.length + 1);
    latex = latex.trim();
    if (!latex)
      return NextResponse.json(
        { error: "no formula recognized" },
        { status: 422 },
      );
    return NextResponse.json({ latex });
  } finally {
    try {
      await fsp.unlink(tmp);
    } catch {}
  }
}
