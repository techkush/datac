// Types for the Milanote-style visual boards. A board is a free canvas of
// cards stored as one JSON file per board under <dataDir>/boards/<id>.json.

/* ---- camera / viewport -------------------------------------------------- */
// Pan offset in screen pixels, zoom clamped to [MIN_ZOOM, MAX_ZOOM].
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

/* ---- cards --------------------------------------------------------------- */
interface CardBase {
  id: string;
  x: number; // canvas coords (top-left); ignored while docked in a column
  y: number;
  w: number; // width in canvas units
  h?: number; // absent = auto height (notes, todos, links)
  z: number; // stacking order, renumbered 0..n-1 on save
  columnId?: string; // set while docked inside a ColumnCard
  color?: string; // optional tint (a WORKSPACE_COLORS value)
}

export interface NoteCard extends CardBase {
  type: "note";
  html: string;
}

export interface ImageCard extends CardBase {
  type: "image";
  src: string;
  caption?: string;
  natW?: number; // natural pixel size, for aspect-locked resize
  natH?: number;
}

export interface LinkCard extends CardBase {
  type: "link";
  url: string;
  title: string;
  description?: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoCard extends CardBase {
  type: "todo";
  title: string;
  items: TodoItem[];
}

// A card that opens a child board. Title and card count are rendered from
// the board summaries, never duplicated here.
export interface BoardLinkCard extends CardBase {
  type: "board";
  boardId: string;
}

// Milanote-style column container. `children` (ordered docked card ids) is
// the source of truth for order; each docked card's `columnId` is the
// reverse pointer — reconciled on load, `children` wins.
export interface ColumnCard extends CardBase {
  type: "column";
  title: string;
  children: string[];
}

export type CellKind = "text" | "number" | "date" | "currency" | "checkbox";

export interface TableColumn {
  id: string;
  name: string;
  kind: CellKind;
  width?: number;
}

// Strings starting with "=" are formulas, evaluated at render time.
export type CellValue = string | number | boolean | null;

export interface TableRow {
  id: string;
  cells: Record<string, CellValue>; // keyed by column id
}

export interface TableCard extends CardBase {
  type: "table";
  columns: TableColumn[];
  rows: TableRow[];
}

// A color swatch for moodboards/palettes: the hex value fills the card with
// an editable name row below.
export interface ColorCard extends CardBase {
  type: "color";
  value: string; // #rrggbb
  name?: string; // empty = show the auto-derived name
}

export interface SketchStroke {
  color: string;
  width: number;
  points: [number, number][]; // card-local coords
}

export interface SketchCard extends CardBase {
  type: "sketch";
  strokes: SketchStroke[];
  // Natural size when the drawing was saved — the svg viewBox, so resizing
  // the card scales the strokes. Absent on legacy cards (drawn 1:1).
  viewW?: number;
  viewH?: number;
}

export type BoardCard =
  | NoteCard
  | ImageCard
  | LinkCard
  | TodoCard
  | BoardLinkCard
  | ColumnCard
  | TableCard
  | SketchCard
  | ColorCard;

export type BoardCardType = BoardCard["type"];

/* ---- board files --------------------------------------------------------- */
// On-disk shape of <dataDir>/boards/<boardId>.json.
export interface BoardFile {
  name: string;
  parent: string; // parent board id, "" = root board
  created: string; // ISO
  updated: string; // ISO
  viewport?: Camera; // last camera position, restored on open
  cards: BoardCard[];
  [key: string]: unknown; // forward-compat, mirrors Workspace
}

// Listing shape for pickers, breadcrumbs and the home panel.
export interface BoardSummary {
  id: string;
  name: string;
  parent: string;
  created: string | null;
  updated: string | null;
  cardCount: number;
}
