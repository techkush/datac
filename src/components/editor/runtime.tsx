"use client";

import * as React from "react";
import type { Block } from "@/lib/datac/types";
import type { DomRegistry } from "./blocks-util";
import type { DatacClient } from "@/lib/datac/client";
import type { DocSummary } from "@/lib/datac/types";

export interface FocusRequest {
  id: string;
  atEnd?: boolean;
  offset?: number;
}

export interface SlashRequest {
  listId: string;
  blockId: string;
  rect: DOMRect;
  query: string;
}

export interface BlockMenuRequest {
  listId: string;
  blockId: string;
  rect: DOMRect;
}

export interface MathTarget {
  // edit an existing math block, or replace a target block with a new one
  listId: string;
  blockId: string;
  mode: "edit" | "insert";
}

export interface EditorRuntimeValue {
  registry: DomRegistry;
  register: (id: string, el: HTMLElement | null) => void;
  requestFocus: (req: FocusRequest) => void;
  docs: DocSummary[];
  client: DatacClient;
  openDoc: (id: string) => void;

  // structural mutation for a given list (column path or root)
  mutateList: (listId: string, fn: (blocks: Block[]) => Block[]) => void;
  getList: (listId: string) => Block[];
  moveBlock: (
    fromListId: string,
    blockId: string,
    toListId: string,
    toIndex: number,
  ) => void;

  markChanged: () => void;
  captureHistory: () => void;

  openSlash: (req: SlashRequest | null) => void;
  openBlockMenu: (req: BlockMenuRequest | null) => void;
  openMath: (target: MathTarget | null) => void;
  openComments: (blockId: string) => void;
  openPagePicker: (rect: DOMRect, cb: (pageId: string) => void) => void;
  requestUpload: (
    listId: string,
    blockId: string,
    kind: "image" | "file",
  ) => void;
  createChildPage: () => Promise<string | null>;

  comments: Record<string, { text: string; at: string; by: string }[]>;
}

const RuntimeContext = React.createContext<EditorRuntimeValue | null>(null);

export function useRuntime(): EditorRuntimeValue {
  const ctx = React.useContext(RuntimeContext);
  if (!ctx) throw new Error("useRuntime must be used within the editor");
  return ctx;
}

export const RuntimeProvider = RuntimeContext.Provider;
