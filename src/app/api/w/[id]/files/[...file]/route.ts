import fs from "fs";
import path from "path";
import { workspaceDir } from "@/lib/datac/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fsp = fs.promises;

const MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; file: string[] }> },
) {
  const { id, file } = await params;
  const dataDir = await workspaceDir(id);
  if (!dataDir) return new Response("Not found", { status: 404 });
  // Only ever serve out of <dataDir>/files, by basename — no traversal.
  const name = path.basename((file || []).join("/"));
  const filePath = path.join(dataDir, "files", name);
  try {
    const data = await fsp.readFile(filePath);
    const type =
      MIME[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream";
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: { "Content-Type": type, "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
