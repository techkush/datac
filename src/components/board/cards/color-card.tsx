"use client";

import * as React from "react";
import {
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useBoard } from "../store";
import type { ColorCard, ColorFormat } from "@/lib/datac/board-types";

// Compact named-color reference for the auto name below the swatch — the
// nearest entry (RGB distance) is shown until the user types their own.
const NAMED_COLORS: [string, string][] = [
  ["Black", "#000000"],
  ["White", "#ffffff"],
  ["Gray", "#808080"],
  ["Silver", "#c0c0c0"],
  ["Charcoal", "#36454f"],
  ["Ivory", "#fffff0"],
  ["Beige", "#f5f5dc"],
  ["Red", "#ff0000"],
  ["Crimson", "#dc143c"],
  ["Cinnabar", "#e34234"],
  ["Coral", "#ff7f50"],
  ["Salmon", "#fa8072"],
  ["Maroon", "#800000"],
  ["Brown", "#8b4513"],
  ["Tan", "#d2b48c"],
  ["Orange", "#ffa500"],
  ["Amber", "#ffbf00"],
  ["Gold", "#ffd700"],
  ["Yellow", "#ffff00"],
  ["Mustard", "#e1ad01"],
  ["Olive", "#808000"],
  ["Lime", "#32cd32"],
  ["Green", "#008000"],
  ["Emerald", "#34d399"],
  ["Mint", "#98fb98"],
  ["Teal", "#008080"],
  ["Cyan", "#00ffff"],
  ["Sky", "#38bdf8"],
  ["Azure", "#007fff"],
  ["Blue", "#0000ff"],
  ["Navy", "#000080"],
  ["Indigo", "#4b0082"],
  ["Violet", "#8f00ff"],
  ["Purple", "#800080"],
  ["Lavender", "#b57edc"],
  ["Magenta", "#ff00ff"],
  ["Fuchsia", "#c154c1"],
  ["Pink", "#ffc0cb"],
  ["Rose", "#fb7185"],
];

const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function nearestName(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "";
  let best = "";
  let bestD = Infinity;
  for (const [name, ref] of NAMED_COLORS) {
    const [r, g, b] = hexToRgb(ref)!;
    const d = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

// Value label in the chosen display format.
function formatValue(hex: string, format: ColorFormat): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex.toUpperCase();
  const [r, g, b] = rgb;
  if (format === "rgb") return `rgb(${r}, ${g}, ${b})`;
  if (format === "hsl") {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      if (max === rn) h = 60 * (((gn - bn) / d) % 6);
      else if (max === gn) h = 60 * ((bn - rn) / d + 2);
      else h = 60 * ((rn - gn) / d + 4);
      if (h < 0) h += 360;
    }
    return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  }
  return hex.toUpperCase();
}

// Black or white text, whichever reads better on the swatch.
function textOn(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#000";
  const [r, g, b] = rgb.map((v) => v / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#000000" : "#ffffff";
}

export function ColorCardView({ card }: { card: ColorCard }) {
  const { updateCard } = useBoard();
  const pickerRef = React.useRef<HTMLInputElement | null>(null);
  const [hexDraft, setHexDraft] = React.useState<string | null>(null);

  const commitHex = () => {
    if (hexDraft === null) return;
    const rgb = hexToRgb(hexDraft);
    if (rgb)
      updateCard(card.id, {
        value: (hexDraft.startsWith("#") ? hexDraft : `#${hexDraft}`).toUpperCase(),
      });
    setHexDraft(null);
  };

  const fg = textOn(card.value);
  const format = card.format ?? "hex";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md">
      {/* swatch — double-click opens the native picker */}
      <div
        className="relative min-h-0 flex-1"
        style={{ background: card.value }}
        onDoubleClick={(e) => {
          // only from the swatch surface itself — a double-click while
          // editing the hex text must keep its select-word behavior
          if ((e.target as HTMLElement).closest("input")) return;
          const picker = pickerRef.current;
          if (!picker) return;
          try {
            picker.showPicker();
          } catch {
            picker.click(); // older engines without showPicker()
          }
        }}
        title="Double-click to pick a color"
      >
        {/* value label per display format; only hex is directly editable */}
        {format === "hex" ? (
          <input
            value={hexDraft ?? card.value.toUpperCase()}
            onFocus={() => setHexDraft(card.value.toUpperCase())}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setHexDraft(null);
            }}
            aria-label="Hex color value"
            spellCheck={false}
            className="absolute top-2.5 left-3 w-24 bg-transparent font-mono text-sm font-semibold tracking-wide outline-none"
            style={{ color: fg }}
          />
        ) : format !== "off" ? (
          <span
            aria-label="Color value"
            className="absolute top-2.5 left-3 font-mono text-sm font-semibold tracking-wide"
            style={{ color: fg }}
          >
            {formatValue(card.value, format)}
          </span>
        ) : null}
        {/* hidden native color picker — opened by double-clicking the swatch */}
        <input
          ref={pickerRef}
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(card.value) ? card.value : "#000000"}
          onChange={(e) =>
            updateCard(card.id, { value: e.target.value.toUpperCase() })
          }
          aria-label="Pick color"
          tabIndex={-1}
          className="pointer-events-none absolute right-2 bottom-2 size-0 opacity-0"
        />
      </div>
      {/* name row */}
      <input
        value={card.name ?? ""}
        onChange={(e) => updateCard(card.id, { name: e.target.value })}
        placeholder={nearestName(card.value) || "Name this color"}
        aria-label="Color name"
        className="placeholder:text-muted-foreground/80 bg-card w-full px-3 py-2 text-sm outline-none"
      />
    </div>
  );
}

// Right-click settings: how the value label displays on the swatch.
export function ColorMenuItems({ card }: { card: ColorCard }) {
  const { updateCard } = useBoard();
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>Value format</ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-28">
        <ContextMenuRadioGroup
          value={card.format ?? "hex"}
          onValueChange={(v) =>
            updateCard(card.id, { format: v as ColorFormat })
          }
        >
          <ContextMenuRadioItem value="hex">HEX</ContextMenuRadioItem>
          <ContextMenuRadioItem value="rgb">RGB</ContextMenuRadioItem>
          <ContextMenuRadioItem value="hsl">HSL</ContextMenuRadioItem>
          <ContextMenuRadioItem value="off">Off</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
