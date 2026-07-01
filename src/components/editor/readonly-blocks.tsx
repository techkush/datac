"use client";

/**
 * Temporary read-only block viewer (Phase 3). Phase 4 replaces this with the
 * fully editable block engine. It renders every stored block type so we can
 * verify docs load and navigate correctly.
 */
import * as React from "react";
import { FileText } from "lucide-react";
import { useEditor } from "./store";
import type { Block } from "@/lib/datac/types";
import { renderInline } from "@/lib/datac/markdown";
import { renderMathHtml } from "@/lib/datac/math";
import { formatSize } from "@/lib/datac/upload";
import { cn } from "@/lib/utils";

function Html({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: renderInline(html || "") }}
    />
  );
}

function colorAttrs(b: Block) {
  const props = (b.props as { tc?: string; bg?: string }) || {};
  return {
    "data-tc": props.tc || undefined,
    "data-bg": props.bg || undefined,
  } as Record<string, string | undefined>;
}

function BlockView({ b }: { b: Block }) {
  const { docs, openDoc, client } = useEditor();
  const attrs = colorAttrs(b);
  switch (b.type) {
    case "h1":
      return <Html html={b.html || ""} className="mt-5 text-3xl font-bold" {...attrs} />;
    case "h2":
      return <Html html={b.html || ""} className="mt-4 text-2xl font-bold" {...attrs} />;
    case "h3":
      return <Html html={b.html || ""} className="mt-3 text-xl font-semibold" {...attrs} />;
    case "h4":
      return <Html html={b.html || ""} className="mt-2 text-lg font-semibold" {...attrs} />;
    case "bulleted":
      return (
        <div className="flex gap-2" {...attrs}>
          <span className="text-muted-foreground select-none">•</span>
          <Html html={b.html || ""} className="flex-1" />
        </div>
      );
    case "numbered":
      return (
        <div className="flex gap-2" {...attrs}>
          <span className="text-muted-foreground select-none">•</span>
          <Html html={b.html || ""} className="flex-1" />
        </div>
      );
    case "todo":
      return (
        <label className="flex items-start gap-2" {...attrs}>
          <input
            type="checkbox"
            checked={!!(b.props as { checked?: boolean })?.checked}
            readOnly
            className="mt-1.5"
          />
          <Html
            html={b.html || ""}
            className={cn(
              "flex-1",
              (b.props as { checked?: boolean })?.checked &&
                "text-muted-foreground line-through",
            )}
          />
        </label>
      );
    case "quote":
      return (
        <blockquote className="border-primary/40 text-muted-foreground border-l-2 pl-4 italic" {...attrs}>
          <Html html={b.html || ""} />
        </blockquote>
      );
    case "code":
      return (
        <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-sm">
          <code>{(b.text as string) || ""}</code>
        </pre>
      );
    case "math":
      return (
        <div
          className="overflow-x-auto py-1"
          dangerouslySetInnerHTML={{ __html: renderMathHtml((b.tex as string) || "") }}
        />
      );
    case "divider":
      return <hr className="border-border my-2" />;
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={(b.url as string) || ""}
          alt={(b.alt as string) || ""}
          className="mx-auto max-h-[70vh] rounded-md"
        />
      );
    case "file":
    case "linkfile":
      return (
        <button
          onClick={() =>
            b.type === "linkfile"
              ? client.openFile((b.path as string) || "")
              : window.open((b.url as string) || "", "_blank")
          }
          className="hover:bg-accent flex w-full items-center gap-3 rounded-md border p-3 text-left"
        >
          <span className="text-xl">{b.type === "linkfile" ? "🔗" : "📎"}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {(b.name as string) || "file"}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {b.type === "linkfile"
                ? (b.path as string)
                : b.size
                  ? formatSize(b.size as number)
                  : "uploaded file"}
            </span>
          </span>
        </button>
      );
    case "page": {
      const child = docs.find((d) => d.id === b.pageId);
      return (
        <button
          onClick={() => b.pageId && openDoc(b.pageId)}
          className="hover:bg-accent flex w-full items-center gap-3 rounded-md border p-3 text-left"
        >
          <span className="text-xl">{child?.icon || "📄"}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {child?.title || "Untitled"}
            </span>
            <span className="text-muted-foreground text-xs">
              {b.link ? "Link ›" : "Page ›"}
            </span>
          </span>
        </button>
      );
    }
    case "table":
      return (
        <div
          className="[&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_table]:w-full [&_table]:border-collapse"
          dangerouslySetInnerHTML={{ __html: (b.html as string) || "" }}
        />
      );
    case "columns":
      return (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${(b.cols as Block[][])?.length || 2}, 1fr)`,
          }}
        >
          {((b.cols as Block[][]) || []).map((col, i) => (
            <div key={i} className="flex flex-col gap-2">
              {col.map((cb) => (
                <BlockView key={cb.id} b={cb} />
              ))}
            </div>
          ))}
        </div>
      );
    default:
      return <Html html={b.html || ""} {...attrs} />;
  }
}

export function ReadonlyBlocks() {
  const { blocks } = useEditor();
  if (!blocks.length)
    return (
      <p className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
        <FileText className="size-4" /> This page is empty.
      </p>
    );
  return (
    <div className="flex flex-col gap-1.5 pb-40 text-[15px] leading-relaxed">
      {blocks.map((b) => (
        <BlockView key={b.id} b={b} />
      ))}
    </div>
  );
}
