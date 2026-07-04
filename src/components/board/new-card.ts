import { randomId } from "@/lib/datac/constants";
import type { BoardCard, BoardCardType } from "@/lib/datac/board-types";
import type { Point } from "./coords";

// Default width (and height, where fixed) for each freshly added card type.
export const CARD_SIZES: Record<BoardCardType, { w: number; h?: number }> = {
  note: { w: 240 },
  image: { w: 320 },
  link: { w: 280 },
  todo: { w: 240 },
  board: { w: 220 },
  column: { w: 280 },
  table: { w: 460 },
  sketch: { w: 320, h: 240 },
  color: { w: 180, h: 200 },
};

// A new card of `type` centered-ish at `at` (canvas coords). Cards that need
// extra data (image src, board id, link url) get placeholder values the card
// UI immediately asks for.
export function newCard(
  type: BoardCardType,
  at: Point,
  extra: Partial<BoardCard> = {},
): Omit<BoardCard, "z"> {
  const size = CARD_SIZES[type];
  const base = {
    id: randomId(),
    x: Math.round(at.x - size.w / 2),
    y: Math.round(at.y),
    w: size.w,
    ...(size.h ? { h: size.h } : {}),
  };
  switch (type) {
    case "note":
      return { ...base, type, html: "", ...extra } as Omit<BoardCard, "z">;
    case "image":
      return { ...base, type, src: "", ...extra } as Omit<BoardCard, "z">;
    case "link":
      return { ...base, type, url: "", title: "", ...extra } as Omit<
        BoardCard,
        "z"
      >;
    case "todo":
      return {
        ...base,
        type,
        title: "",
        items: [{ id: randomId(), text: "", done: false }],
        ...extra,
      } as Omit<BoardCard, "z">;
    case "board":
      return { ...base, type, boardId: "", ...extra } as Omit<BoardCard, "z">;
    case "column":
      return { ...base, type, title: "", children: [], ...extra } as Omit<
        BoardCard,
        "z"
      >;
    case "table":
      return {
        ...base,
        type,
        columns: [
          { id: randomId(), name: "Item", kind: "text" as const },
          { id: randomId(), name: "Qty", kind: "number" as const },
          { id: randomId(), name: "Price", kind: "currency" as const },
        ],
        rows: Array.from({ length: 3 }, () => ({ id: randomId(), cells: {} })),
        ...extra,
      } as Omit<BoardCard, "z">;
    case "sketch":
      return { ...base, type, strokes: [], ...extra } as Omit<BoardCard, "z">;
    case "color":
      return { ...base, type, value: "#E63F19", name: "", ...extra } as Omit<
        BoardCard,
        "z"
      >;
  }
}
