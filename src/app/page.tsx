import { readRegistry } from "@/lib/datac/registry";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  WorkspacesList,
  type WorkspaceRow,
} from "@/components/workspaces/workspaces-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const reg = await readRegistry();
  const rows: WorkspaceRow[] = Object.entries(reg)
    .sort((a, b) =>
      String(b[1].opened || "").localeCompare(String(a[1].opened || "")),
    )
    .map(([id, w]) => ({
      id,
      title: w.title || "Untitled",
      projectDir: w.projectDir || "",
    }));

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <span className="text-primary">◆</span> datac workspaces
        </h1>
        <ThemeToggle />
      </header>
      <WorkspacesList initial={rows} />
    </main>
  );
}
