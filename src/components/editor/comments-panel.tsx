"use client";

import * as React from "react";
import { Link2, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useEditor, type CommentEntry } from "./store";
import { escapeHtml } from "@/lib/datac/markdown";

function commentHtml(t: string): string {
  let s = escapeHtml(t);
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="underline">$1</a>',
  );
  s = s.replace(
    /(^|[\s(])((?:https?:\/\/|www\.)[^\s<)]+)/g,
    (_m, pre, url) => {
      const href = url.startsWith("http") ? url : "http://" + url;
      return `${pre}<a href="${href}" target="_blank" rel="noopener" class="underline">${url}</a>`;
    },
  );
  return s.replace(/\n/g, "<br>");
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function CommentsPanel({
  bid,
  onClose,
}: {
  bid: string | null;
  onClose: () => void;
}) {
  const { comments, setComments } = useEditor();
  const [text, setText] = React.useState("");
  const items: CommentEntry[] = (bid && comments[bid]) || [];

  const send = () => {
    const t = text.trim();
    if (!t || !bid) return;
    const next = { ...comments };
    next[bid] = [...(next[bid] || []), { text: t, at: new Date().toISOString(), by: "You" }];
    setComments(next);
    setText("");
  };

  const del = (i: number) => {
    if (!bid) return;
    const arr = (comments[bid] || []).slice();
    arr.splice(i, 1);
    const next = { ...comments };
    if (arr.length) next[bid] = arr;
    else delete next[bid];
    setComments(next);
  };

  const insertLink = () => {
    const url = prompt("Link URL:");
    if (!url) return;
    const label = prompt("Link text (optional):", url) || url;
    setText((t) => t + `[${label}](${url}) `);
  };

  return (
    <Sheet open={!!bid} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>💬 Comments</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          {items.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No comments yet on this section. Add one below.
            </p>
          )}
          {items.map((c, i) => (
            <div key={i} className="bg-muted/50 rounded-md p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium">{c.by || "You"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {fmtTime(c.at)}
                  </span>
                  <button
                    onClick={() => del(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <div
                className="text-sm"
                dangerouslySetInnerHTML={{ __html: commentHtml(c.text) }}
              />
            </div>
          ))}
        </div>
        <div className="border-t p-4">
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Add a comment…  (paste a link or use [text](url))"
            className="bg-muted w-full resize-none rounded-md p-2 text-sm outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={insertLink}>
              <Link2 className="size-4" /> Link
            </Button>
            <Button size="sm" onClick={send}>
              Comment
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
