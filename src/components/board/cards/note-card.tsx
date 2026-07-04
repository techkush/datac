"use client";

import * as React from "react";
import { useBoard } from "../store";
import type { NoteCard } from "@/lib/datac/board-types";

// A simple rich-ish text card: uncontrolled contentEditable storing HTML.
// React renders the editable with NO managed children — its content is set
// imperatively below. (React 19 re-syncs dangerouslySetInnerHTML children on
// re-render, which wipes what the browser inserted between keystrokes.)
// Bold/italic/underline via the native shortcuts; paste is forced to plain
// text so foreign markup never enters the board file.
export function NoteCardView({ card }: { card: NoteCard }) {
  const { updateCard } = useBoard();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [empty, setEmpty] = React.useState(!card.html);

  // Load content on mount and reflect external changes while unfocused
  // (e.g. a duplicate landing next to the original). Never rewrite the DOM
  // under the caret.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== card.html)
      el.innerHTML = card.html;
    setEmpty(!card.html || card.html === "<br>");
  }, [card.html]);

  return (
    <div className="relative">
      {empty && (
        <span className="text-muted-foreground pointer-events-none absolute px-3 py-2.5 text-sm">
          Write a note…
        </span>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Note"
        // select-text: the canvas viewport is select-none (for clean drags),
        // which would otherwise block caret placement in contentEditable
        className="min-h-16 cursor-text select-text px-3 py-2.5 text-sm outline-none [&_a]:underline"
        onInput={(e) => {
          const html = (e.currentTarget as HTMLDivElement).innerHTML;
          setEmpty(!html || html === "<br>");
          updateCard(card.id, { html });
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        onKeyDown={(e) => {
          // keep board shortcuts (delete, cmd+a…) inside the editor
          e.stopPropagation();
          const mod = e.metaKey || e.ctrlKey;
          if (mod && ["b", "i", "u"].includes(e.key.toLowerCase())) {
            e.preventDefault();
            document.execCommand(
              { b: "bold", i: "italic", u: "underline" }[
                e.key.toLowerCase() as "b" | "i" | "u"
              ],
            );
            updateCard(card.id, {
              html: (e.currentTarget as HTMLDivElement).innerHTML,
            });
          }
        }}
      />
    </div>
  );
}
