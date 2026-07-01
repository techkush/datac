import Link from "next/link";
import { readRegistry, workspaceDir } from "@/lib/datac/registry";
import { listDocs } from "@/lib/datac/docs";
import { EditorApp } from "@/components/editor/editor-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dir = await workspaceDir(id);
  if (!dir) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-4xl">🗂️</div>
        <h1 className="text-lg font-semibold">Unknown workspace</h1>
        <p className="text-muted-foreground text-sm">
          Run <code className="bg-muted rounded px-1.5 py-0.5">datac init</code>{" "}
          in its folder, or pick another workspace.
        </p>
        <Link href="/" className="text-primary text-sm underline">
          ← All workspaces
        </Link>
      </main>
    );
  }
  const reg = await readRegistry();
  const w = reg[id] || {};
  const docs = await listDocs(dir);

  return (
    <EditorApp
      ws={id}
      info={{ title: w.title || "Untitled", projectDir: w.projectDir }}
      docs={docs}
    />
  );
}
