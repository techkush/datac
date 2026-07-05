import path from "path";
import { readRegistry } from "@/lib/datac/registry";
import { focusTotals } from "@/lib/datac/focus";
import { readQuickLinks } from "@/lib/datac/quicklinks";
import { readOpenApps } from "@/lib/datac/openapps";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  WorkspacesList,
  type WorkspaceRow,
} from "@/components/workspaces/workspaces-list";
import { OpenApps } from "@/components/workspaces/open-apps";
import { QuickLinks } from "@/components/workspaces/quick-links";
import {
  BoardsPanel,
  type BoardsPanelWorkspace,
} from "@/components/workspaces/boards-panel";
import { listBoards } from "@/lib/datac/boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const [reg, totals, links, apps] = await Promise.all([
    readRegistry(),
    focusTotals(),
    readQuickLinks(),
    readOpenApps(),
  ]);

  // Board summaries per active workspace for the left-column panel.
  const boardWs: BoardsPanelWorkspace[] = await Promise.all(
    Object.entries(reg)
      .filter(([, w]) => !w.trashed && w.dataDir)
      .sort((a, b) =>
        String(b[1].opened || "").localeCompare(String(a[1].opened || "")),
      )
      .map(async ([id, w]) => ({
        id,
        title: w.title || "Untitled",
        color: w.color || "",
        boards: await listBoards(w.dataDir as string).catch(() => []),
      })),
  );

  const rows: WorkspaceRow[] = Object.entries(reg)
    .sort((a, b) =>
      String(b[1].opened || "").localeCompare(String(a[1].opened || "")),
    )
    .map(([id, w]) => ({
      id,
      title: w.title || "Untitled",
      folderName: path.basename(w.projectDir || "") || "untitled",
      opened: w.opened || "",
      focusSeconds: totals[id] || 0,
      trashed: !!w.trashed,
      color: w.color || "",
    }));

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center justify-between border-b px-5 backdrop-blur">
        <h1 className="flex items-center gap-2.5 text-base font-semibold tracking-tight">
          <span className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-md text-sm">
            ◆
          </span>
          DataC Workspace
        </h1>
        <ThemeToggle />
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_minmax(0,2.2fr)_1fr] lg:divide-x">
        <aside className="hidden flex-col gap-6 px-5 py-8 lg:flex">
          <BoardsPanel initial={boardWs} />
        </aside>

        <main className="flex flex-col gap-6 px-6 py-8">
          <WorkspacesList initial={rows} />
        </main>

        <aside className="flex flex-col gap-6 border-t px-5 py-8 lg:border-t-0">
          <OpenApps initial={apps} />
          <div className="border-t" />
          <QuickLinks initial={links} />
        </aside>
      </div>
    </div>
  );
}
