// Browser-side API client, scoped to a single workspace (/api/w/<id>).
import type { Block, DocSummary } from "./types";

export interface FullDoc {
  id: string;
  format: "json" | "markdown";
  title: string;
  icon: string;
  cover: string;
  parent: string;
  orphaned?: boolean;
  status: string;
  blocks?: Block[];
  comments?: Record<string, unknown>;
  content?: string; // legacy markdown body
  styles?: Record<string, { tc?: string; bg?: string }>;
  updated?: string;
  created?: string;
  error?: string;
}

export interface DocFields {
  title?: string;
  icon?: string;
  cover?: string;
  parent?: string;
  status?: string;
  orphaned?: boolean;
  blocks?: Block[];
  comments?: Record<string, unknown>;
  created?: string;
}

export interface SaveResult {
  id: string;
  title: string;
  icon: string;
  updated: string;
  created: string;
}

export interface WorkspaceInfo {
  id: string;
  title: string;
  projectDir?: string;
  dataDir: string;
}

const json = (r: Response) => r.json();

export function createClient(ws: string) {
  const API = `/api/w/${ws}`;
  return {
    ws,
    info: (): Promise<WorkspaceInfo> => fetch(`${API}/info`).then(json),
    list: (): Promise<DocSummary[]> => fetch(`${API}/docs`).then(json),
    get: (id: string): Promise<FullDoc> => fetch(`${API}/docs/${id}`).then(json),
    create: (
      fields: DocFields = { title: "Untitled", blocks: [] },
    ): Promise<SaveResult> =>
      fetch(`${API}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      }).then(json),
    save: (
      id: string,
      fields: DocFields,
      keepalive = false,
    ): Promise<SaveResult> =>
      fetch(`${API}/docs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
        keepalive,
      }).then(json),
    remove: (id: string): Promise<{ ok: boolean }> =>
      fetch(`${API}/docs/${id}`, { method: "DELETE" }).then(json),
    upload: (
      name: string,
      dataUrl: string,
    ): Promise<{ url: string; name: string; size: number; error?: string }> =>
      fetch(`${API}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, dataUrl }),
      }).then(json),
    reveal: (): Promise<{ ok?: boolean; dir?: string }> =>
      fetch(`${API}/reveal`, { method: "POST" }).then(json),
    pickFile: (): Promise<{
      path?: string;
      name?: string;
      cancelled?: boolean;
      error?: string;
    }> => fetch(`${API}/pick-file`, { method: "POST" }).then(json),
    openFile: (p: string): Promise<{ ok?: boolean; error?: string }> =>
      fetch(`${API}/open-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      }).then(json),
  };
}

export type DatacClient = ReturnType<typeof createClient>;
