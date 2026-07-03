"use client";

import * as React from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { EditorProvider, useEditor } from "./store";
import { AppSidebar } from "./app-sidebar";
import { Topbar } from "./topbar";
import dynamic from "next/dynamic";
import { PageHead } from "./page-head";
import { Button } from "@/components/ui/button";

const BlockNoteEditor = dynamic(
  () => import("./blocknote-editor").then((m) => m.BlockNoteEditor),
  { ssr: false },
);
import { FilePlus2 } from "lucide-react";
import type { DocSummary } from "@/lib/datac/types";

function DocArea() {
  const { currentId, newDoc } = useEditor();
  if (!currentId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
        <div className="text-5xl">📝</div>
        <div>
          <h2 className="text-lg font-semibold">No page open</h2>
          <p className="text-muted-foreground text-sm">
            Create a new page or pick one from the sidebar to start writing.
          </p>
        </div>
        <Button onClick={newDoc}>
          <FilePlus2 className="size-4" /> Create your first page
        </Button>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <PageHead />
      {/* Same container geometry as PageHead so the title and the block
          text share one left edge; the drag handle floats in the padding. */}
      <div className="mx-auto w-full max-w-3xl px-6 pb-24 sm:px-12">
        <BlockNoteEditor key={currentId} />
      </div>
    </div>
  );
}

export function EditorApp({
  ws,
  info,
  docs,
}: {
  ws: string;
  info: { title: string; projectDir?: string };
  docs: DocSummary[];
}) {
  return (
    <EditorProvider ws={ws} initialInfo={info} initialDocs={docs}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex h-svh min-w-0 flex-col overflow-hidden">
          <Topbar />
          <DocArea />
        </SidebarInset>
      </SidebarProvider>
    </EditorProvider>
  );
}
