"use client";

import * as React from "react";
import { useBoard } from "../store";
import { useCardEditing } from "../card-edit-context";
import type { NoteCard } from "@/lib/datac/board-types";

// A rich-ish text editor shared by the note and column cards: uncontrolled
// contentEditable storing HTML on the given card. React renders the editable
// with NO managed children — its content is set imperatively below. (React
// 19 re-syncs dangerouslySetInnerHTML children on re-render, which wipes
// what the browser inserted between keystrokes.)
//
// Edit mode comes from the card shell (double-click); outside of it the
// shell keeps the whole card as a drag surface. Bold/italic/underline via
// the native shortcuts; paste is forced to plain text so foreign markup
// never enters the board file.
export function NoteText({
  cardId,
  html,
  className = "min-h-16 px-3 py-2.5",
}: {
  cardId: string;
  html: string;
  className?: string;
}) {
  const { updateCard } = useBoard();
  const editing = useCardEditing()?.editing ?? false;
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [empty, setEmpty] = React.useState(!html);

  // Load content on mount and reflect external changes while unfocused
  // (e.g. a duplicate landing next to the original). Never rewrite the DOM
  // under the caret.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== html)
      el.innerHTML = html;
    setEmpty(!html || html === "<br>");
  }, [html]);

  // Entering edit mode: focus and put the caret at the end.
  React.useEffect(() => {
    const el = ref.current;
    if (!editing || !el || document.activeElement === el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  return (
    <div className="relative">
      {empty && (
        <span
          className={`text-muted-foreground pointer-events-none absolute text-sm ${className}`}
        >
          {editing ? "Write a note…" : "Double-click to write…"}
        </span>
      )}
      <div
        ref={ref}
        contentEditable={editing}
        suppressContentEditableWarning
        role="textbox"
        aria-label="Note"
        // select-text: the canvas viewport is select-none (for clean drags),
        // which would otherwise block caret placement in contentEditable
        className={`${className} text-sm outline-none [&_a]:underline ${
          editing ? "cursor-text select-text" : ""
        }`}
        onInput={(e) => {
          const next = (e.currentTarget as HTMLDivElement).innerHTML;
          setEmpty(!next || next === "<br>");
          updateCard(cardId, { html: next });
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        onKeyDown={(e) => {
          if (!editing) return;
          // keep board shortcuts (delete, cmd+a…) inside the editor
          e.stopPropagation();
          if (e.key === "Escape") {
            (e.currentTarget as HTMLDivElement).blur();
            return;
          }
          const mod = e.metaKey || e.ctrlKey;
          if (mod && ["b", "i", "u"].includes(e.key.toLowerCase())) {
            e.preventDefault();
            document.execCommand(
              { b: "bold", i: "italic", u: "underline" }[
                e.key.toLowerCase() as "b" | "i" | "u"
              ],
            );
            updateCard(cardId, {
              html: (e.currentTarget as HTMLDivElement).innerHTML,
            });
          }
        }}
      />
    </div>
  );
}

export function NoteCardView({ card }: { card: NoteCard }) {
  return <NoteText cardId={card.id} html={card.html} />;
}
