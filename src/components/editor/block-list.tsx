"use client";

import * as React from "react";
import { useRuntime } from "./runtime";
import { BlockRow } from "./block-row";
import type { Block } from "@/lib/datac/types";
import { newBlock, isTextType, isEditable } from "./blocks-util";
import { PLACEHOLDERS, TEXT_TYPES } from "@/lib/datac/constants";
import {
  caretAtStart,
  caretAtEnd,
  placeCaret,
  splitHtmlAtCaret,
  textBeforeCaret,
} from "@/lib/datac/caret";

const MD_SHORTCUTS: Record<string, string> = {
  "#": "h1",
  "##": "h2",
  "###": "h3",
  "####": "h4",
  "-": "bulleted",
  "*": "bulleted",
  "1.": "numbered",
  ">": "quote",
  "[]": "todo",
  "[ ]": "todo",
  "```": "code",
};

export function BlockList({
  listId,
  blocks,
}: {
  listId: string;
  blocks: Block[];
}) {
  const rt = useRuntime();

  const focusBody = (id: string, atEnd = false) => {
    const el = rt.registry.get(id);
    if (el) placeCaret(el, atEnd);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number, block: Block) => {
    const el = rt.registry.get(block.id);
    if (!el) return;
    const type = block.type;

    // Space → markdown shortcuts (from an empty-prefix paragraph)
    if (e.key === " " && type === "paragraph") {
      const txt = textBeforeCaret(el);
      const target = MD_SHORTCUTS[txt];
      if (target && el.textContent === txt) {
        e.preventDefault();
        el.innerHTML = ""; // clear the "-"/"#" prefix from the live DOM
        rt.mutateList(listId, (list) => {
          const next = list.slice();
          next[index] = { ...next[index], type: target as Block["type"], html: "" };
          return next;
        });
        rt.requestFocus({ id: block.id, atEnd: true });
        rt.captureHistory();
        return;
      }
    }

    if (e.key === "Enter") {
      if (type === "code") {
        if (e.shiftKey) {
          e.preventDefault();
          const nb = newBlock("paragraph");
          rt.mutateList(listId, (list) => {
            const next = list.slice();
            next.splice(index + 1, 0, nb);
            return next;
          });
          rt.requestFocus({ id: nb.id });
        }
        return; // newline inside code
      }
      if (e.shiftKey) return; // soft line break
      e.preventDefault();

      // "---" → divider
      if (type === "paragraph" && el.textContent?.trim() === "---") {
        const nb = newBlock("paragraph");
        rt.mutateList(listId, (list) => {
          const next = list.slice();
          next[index] = { id: next[index].id, type: "divider" };
          next.splice(index + 1, 0, nb);
          return next;
        });
        rt.requestFocus({ id: nb.id });
        rt.captureHistory();
        return;
      }

      // empty list-like → paragraph
      if (
        ["bulleted", "numbered", "todo", "quote"].includes(type) &&
        el.textContent?.trim() === ""
      ) {
        rt.mutateList(listId, (list) => {
          const next = list.slice();
          next[index] = { ...next[index], type: "paragraph" };
          return next;
        });
        rt.requestFocus({ id: block.id });
        rt.captureHistory();
        return;
      }

      // split at caret
      const { before, after } = splitHtmlAtCaret(el);
      const nextType = ["bulleted", "numbered", "todo"].includes(type)
        ? type
        : "paragraph";
      const nb = newBlock(nextType, { html: after });
      rt.mutateList(listId, (list) => {
        const next = list.slice();
        next[index] = { ...next[index], html: before };
        next.splice(index + 1, 0, nb);
        return next;
      });
      rt.requestFocus({ id: nb.id });
      rt.captureHistory();
      return;
    }

    if (e.key === "Backspace" && caretAtStart(el)) {
      if (type !== "paragraph") {
        e.preventDefault();
        rt.mutateList(listId, (list) => {
          const next = list.slice();
          next[index] = { ...next[index], type: "paragraph" };
          return next;
        });
        rt.requestFocus({ id: block.id });
        rt.captureHistory();
        return;
      }
      const prev = blocks[index - 1];
      if (prev) {
        e.preventDefault();
        if (["divider", "image", "file", "linkfile", "math", "page"].includes(prev.type)) {
          rt.mutateList(listId, (list) => {
            const next = list.slice();
            next.splice(index - 1, 1);
            return next;
          });
          rt.requestFocus({ id: block.id });
          rt.captureHistory();
          return;
        }
        if (isEditable(prev.type)) {
          const prevEl = rt.registry.get(prev.id);
          const prevLen = prevEl?.textContent?.length ?? 0;
          const prevHtml = prevEl?.innerHTML ?? "";
          const curHtml = el.innerHTML;
          rt.mutateList(listId, (list) => {
            const next = list.slice();
            next[index - 1] = { ...next[index - 1], html: prevHtml + curHtml };
            next.splice(index, 1);
            return next;
          });
          rt.requestFocus({ id: prev.id, offset: prevLen });
          rt.captureHistory();
          return;
        }
      }
    }

    if (e.key === "ArrowUp" && caretAtStart(el)) {
      for (let i = index - 1; i >= 0; i--) {
        if (isEditable(blocks[i].type)) {
          e.preventDefault();
          focusBody(blocks[i].id, true);
          return;
        }
      }
    }
    if (e.key === "ArrowDown" && caretAtEnd(el)) {
      for (let i = index + 1; i < blocks.length; i++) {
        if (isEditable(blocks[i].type)) {
          e.preventDefault();
          focusBody(blocks[i].id, false);
          return;
        }
      }
    }
  };

  // numbered markers
  let counter = 0;

  return (
    <>
      {blocks.map((block, index) => {
        let marker: number | undefined;
        if (block.type === "numbered") marker = ++counter;
        else counter = 0;
        const placeholder =
          isTextType(block.type) &&
          TEXT_TYPES.has(block.type)
            ? PLACEHOLDERS[block.type] || ""
            : "";
        return (
          <BlockRow
            key={block.id}
            listId={listId}
            block={block}
            index={index}
            markerNumber={marker}
            placeholder={placeholder}
            onKeyDown={(e) => handleKeyDown(e, index, block)}
          />
        );
      })}
    </>
  );
}
