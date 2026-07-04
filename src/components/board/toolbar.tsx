"use client";

import * as React from "react";
import {
  Columns2,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  ListTodo,
  Palette,
  PenLine,
  StickyNote,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BoardCardType } from "@/lib/datac/board-types";
import { useBoard } from "./store";
import { screenToCanvas } from "./coords";
import { newCard, CARD_SIZES } from "./new-card";

const TOOLS: { type: BoardCardType; label: string; icon: React.ElementType }[] =
  [
    { type: "note", label: "Note", icon: StickyNote },
    { type: "image", label: "Image", icon: ImageIcon },
    { type: "link", label: "Link", icon: Link2 },
    { type: "todo", label: "To-do list", icon: ListTodo },
    { type: "board", label: "Board", icon: LayoutDashboard },
    { type: "column", label: "Column", icon: Columns2 },
    { type: "table", label: "Table", icon: Table2 },
    { type: "color", label: "Color swatch", icon: Palette },
  ];

export function BoardToolbar() {
  const { addCard, camera, openDraw } = useBoard();
  const cameraRef = React.useRef(camera);
  cameraRef.current = camera;

  function add(type: BoardCardType) {
    const vp = document.querySelector("[data-board-viewport]");
    const r = vp?.getBoundingClientRect();
    const center = screenToCanvas(
      { x: (r?.width ?? 800) / 2, y: (r?.height ?? 600) / 2 },
      cameraRef.current,
    );
    // small jitter so repeated adds don't stack perfectly
    const jitter = () => Math.round((Math.random() - 0.5) * 48);
    addCard(
      newCard(type, {
        x: center.x + jitter(),
        y: center.y - (CARD_SIZES[type].h ?? 120) / 2 + jitter(),
      }),
    );
  }

  return (
    <div className="bg-background/90 absolute top-1/2 left-3 z-20 flex -translate-y-1/2 flex-col gap-0.5 rounded-xl border p-1 shadow-md backdrop-blur">
      {TOOLS.map(({ type, label, icon: Icon }) => (
        <Tooltip key={type}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-8"
              aria-label={`Add ${label.toLowerCase()}`}
              onClick={() => add(type)}
            >
              <Icon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
      <div className="bg-border my-0.5 h-px" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground size-8"
            aria-label="Draw"
            onClick={() => openDraw()}
          >
            <PenLine className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Draw</TooltipContent>
      </Tooltip>
    </div>
  );
}
