// Shared data-model types for datac documents and workspaces.
// The on-disk canonical store is <workspace>/dataC/<id>.json (a block-tree doc).

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "bulleted"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "divider"
  | "image"
  | "math"
  | "page"
  | "columns"
  | "file"
  | "linkfile"
  | "table";

export interface Block {
  id: string;
  type: BlockType;
  // Inline HTML content for text-ish blocks.
  html?: string;
  // Rich attributes used by specific block types.
  checked?: boolean; // todo
  lang?: string; // code
  color?: string; // text/background color token
  // image
  src?: string;
  caption?: string;
  // math
  latex?: string;
  // page (child page reference)
  pageId?: string;
  title?: string;
  icon?: string;
  // columns: an array of columns, each a list of blocks
  cols?: Block[][];
  // allow forward-compat fields without losing them on round-trip
  [key: string]: unknown;
}

export interface Comment {
  id: string;
  text: string;
  author?: string;
  created?: string;
  resolved?: boolean;
  [key: string]: unknown;
}

export interface DocFile {
  title: string;
  icon: string;
  cover: string;
  parent: string;
  orphaned: boolean;
  status: string;
  created: string;
  updated: string;
  blocks: Block[];
  comments: Record<string, Comment[] | Comment | unknown>;
}

// Lightweight summary used by the sidebar doc list.
export interface DocSummary {
  id: string;
  title: string;
  icon: string;
  updated: string | null;
  created: string | null;
  parent: string;
  orphaned: boolean;
  status: string;
  childOrder: string[];
}

export interface Workspace {
  title?: string;
  projectDir?: string;
  dataDir?: string;
  opened?: string;
  // Accent color shown as a dot on the home-page card title
  // (one of WORKSPACE_COLORS). Absent/empty = no accent.
  color?: string;
  // ISO timestamp when the workspace was moved to the home-page trash.
  // Absent/empty = active. Trashed entries stay in the registry so nothing
  // on disk is ever touched; "delete forever" only drops the entry.
  trashed?: string;
  [key: string]: unknown;
}

export type Registry = Record<string, Workspace>;

// A saved link on the home page (stored in ~/.datac/quicklinks.json).
export interface QuickLink {
  id: string;
  title: string;
  url: string;
  created: string;
}

// A launcher for an installed system app on the home page
// (stored in ~/.datac/openapps.json). `app` is the application name
// as passed to macOS `open -a`.
export interface OpenApp {
  id: string;
  title: string;
  icon: string;
  app: string;
  created: string;
}

// Per-workspace focus time, bucketed by local day (stored in ~/.datac/focus.json).
// { [workspaceId]: { "2026-07-03": seconds, ... } }
export type FocusLog = Record<string, Record<string, number>>;
