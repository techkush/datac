"use client";

import * as React from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { randomId } from "@/lib/datac/constants";
import {
  evaluateFormula,
  FormulaError,
  isFormula,
  type FormulaValue,
} from "@/lib/datac/formula";
import type {
  CellKind,
  CellValue,
  TableCard,
  TableColumn,
} from "@/lib/datac/board-types";
import { useBoard } from "../store";
import { TableCellView, type Computed } from "./table-cell";

const KINDS: { kind: CellKind; label: string }[] = [
  { kind: "text", label: "Text" },
  { kind: "number", label: "Number" },
  { kind: "date", label: "Date" },
  { kind: "currency", label: "Currency" },
  { kind: "checkbox", label: "Checkbox" },
];

// Column index → spreadsheet letters (0 → A, 26 → AA).
const colLetter = (i: number) => {
  let s = "";
  for (i = i + 1; i > 0; i = Math.floor((i - 1) / 26))
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

// Whole-grid recompute (tables here are small): every cell's computed value
// with formula evaluation and cycle detection.
function computeGrid(card: TableCard): Computed[][] {
  const cache = new Map<string, Computed>();
  const visiting = new Set<string>();

  const rawAt = (c: number, r: number): CellValue => {
    const col = card.columns[c];
    const row = card.rows[r];
    if (!col || !row) throw new FormulaError("#REF!");
    return row.cells[col.id] ?? null;
  };

  const valueAt = (c: number, r: number): FormulaValue => {
    const key = `${c},${r}`;
    const hit = cache.get(key);
    if (hit) {
      if (hit.error) throw new FormulaError(hit.error);
      return hit.value;
    }
    if (visiting.has(key)) throw new FormulaError("#CYCLE!");
    const raw = rawAt(c, r);
    if (!isFormula(raw)) return raw;
    visiting.add(key);
    try {
      const value = evaluateFormula(raw, valueAt);
      cache.set(key, { value });
      return value;
    } catch (e) {
      const error = e instanceof FormulaError ? e.code : "#ERR!";
      cache.set(key, { value: null, error });
      throw e instanceof FormulaError ? e : new FormulaError(error);
    } finally {
      visiting.delete(key);
    }
  };

  return card.rows.map((_, r) =>
    card.columns.map((_, c) => {
      try {
        return { value: valueAt(c, r) };
      } catch (e) {
        return {
          value: null,
          error: e instanceof FormulaError ? e.code : "#ERR!",
        };
      }
    }),
  );
}

export function TableCardView({ card }: { card: TableCard }) {
  const { updateCard } = useBoard();
  const grid = React.useMemo(() => computeGrid(card), [card]);

  const patch = (p: Partial<TableCard>) => updateCard(card.id, p);

  const setCell = (rowId: string, colId: string, v: CellValue) =>
    patch({
      rows: card.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: v } } : r,
      ),
    });

  const setColumn = (colId: string, p: Partial<TableColumn>) =>
    patch({
      columns: card.columns.map((c) => (c.id === colId ? { ...c, ...p } : c)),
    });

  const addColumn = () =>
    patch({
      columns: [
        ...card.columns,
        { id: randomId(), name: `Column ${card.columns.length + 1}`, kind: "text" },
      ],
    });

  const deleteColumn = (colId: string) =>
    patch({
      columns: card.columns.filter((c) => c.id !== colId),
      rows: card.rows.map((r) => {
        const cells = { ...r.cells };
        delete cells[colId];
        return { ...r, cells };
      }),
    });

  const addRow = () =>
    patch({ rows: [...card.rows, { id: randomId(), cells: {} }] });

  const deleteRow = (rowId: string) =>
    patch({ rows: card.rows.filter((r) => r.id !== rowId) });

  return (
    <div className="p-2 text-xs">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-muted-foreground/60 w-6 pb-1 text-center font-normal" />
              {card.columns.map((col, i) => (
                <th key={col.id} className="border-b px-1 pb-1 text-left">
                  <div className="flex items-center gap-0.5">
                    <span className="text-muted-foreground/60 pr-0.5 font-normal">
                      {colLetter(i)}
                    </span>
                    <input
                      value={col.name}
                      onChange={(e) => setColumn(col.id, { name: e.target.value })}
                      aria-label={`Column ${colLetter(i)} name`}
                      className="w-full min-w-8 bg-transparent font-semibold outline-none"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground size-5 shrink-0"
                          aria-label={`Column ${col.name} options`}
                        >
                          <ChevronDown className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuRadioGroup
                          value={col.kind}
                          onValueChange={(v) =>
                            setColumn(col.id, { kind: v as CellKind })
                          }
                        >
                          {KINDS.map((k) => (
                            <DropdownMenuRadioItem key={k.kind} value={k.kind}>
                              {k.label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={card.columns.length <= 1}
                          onClick={() => deleteColumn(col.id)}
                        >
                          Delete column
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </th>
              ))}
              <th className="w-6 border-b pb-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-5"
                  aria-label="Add column"
                  onClick={addColumn}
                >
                  <Plus className="size-3" />
                </Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row, r) => (
              <tr key={row.id} className="group/row">
                <td className="text-muted-foreground/60 border-b text-center">
                  {r + 1}
                </td>
                {card.columns.map((col, c) => (
                  <td key={col.id} className="border-b">
                    <TableCellView
                      kind={col.kind}
                      raw={row.cells[col.id] ?? null}
                      computed={grid[r][c]}
                      onChange={(v) => setCell(row.id, col.id, v)}
                    />
                  </td>
                ))}
                <td className="border-b text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-5 opacity-0 group-hover/row:opacity-100"
                    aria-label={`Delete row ${r + 1}`}
                    disabled={card.rows.length <= 1}
                    onClick={() => deleteRow(row.id)}
                  >
                    <X className="size-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground mt-1 h-6 px-1.5 text-xs"
        onClick={addRow}
      >
        <Plus className="size-3" /> Add row
      </Button>
    </div>
  );
}
