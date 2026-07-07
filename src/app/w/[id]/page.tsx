import Link from "next/link";
import { readRegistry, touchOpened, workspaceDir } from "@/lib/datac/registry";
import { listDocs } from "@/lib/datac/docs";
import { EditorApp } from "@/components/editor/editor-app";
import { FocusTracker } from "@/components/workspaces/focus-tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tab title: "DataC | {project name}"
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reg = await readRegistry();
  const title = reg[id]?.title;
  return { title: title ? `DataC | ${title}` : "DataC Workspace" };
}

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
  await touchOpened(id);
  const reg = await readRegistry();
  const w = reg[id] || {};
  const docs = await listDocs(id, dir);

  return (
    <>
      <FocusTracker ws={id} />
      <EditorApp
        ws={id}
        info={{ title: w.title || "Untitled", projectDir: w.projectDir }}
        docs={docs}
      />
    </>
  );
}
