"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { isFormula, type FormulaValue } from "@/lib/datac/formula";
import type { CellKind, CellValue } from "@/lib/datac/board-types";
import { cn } from "@/lib/utils";

export interface Computed {
  value: FormulaValue;
  error?: string;
}

const currencyFmt = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
});

export function formatCell(kind: CellKind, c: Computed): string {
  if (c.error) return c.error;
  const v = c.value;
  if (v === null || v === "") return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (kind === "currency" && typeof v === "number") return currencyFmt.format(v);
  if (kind === "date") {
    const d = new Date(String(v));
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  }
  if (typeof v === "number")
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v);
}

// One editable cell. Shows the raw value (formula source included) while
// focused and the computed, kind-formatted value otherwise.
export function TableCellView({
  kind,
  raw,
  computed,
  onChange,
}: {
  kind: CellKind;
  raw: CellValue;
  computed: Computed;
  onChange: (v: CellValue) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  if (kind === "checkbox" && !isFormula(raw)) {
    return (
      <div className="flex items-center justify-center py-1">
        <Checkbox
          checked={raw === true}
          onCheckedChange={(v) => onChange(v === true)}
          aria-label="Cell checkbox"
        />
      </div>
    );
  }

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t === "") return onChange(null);
    if (t.startsWith("=")) return onChange(t);
    if (kind === "number" || kind === "currency") {
      const n = parseFloat(t);
      return onChange(Number.isNaN(n) ? t : n);
    }
    if (kind === "checkbox") return onChange(/^(true|1|yes|x)$/i.test(t));
    return onChange(t);
  }

  return (
    <input
      value={editing ? draft : formatCell(kind, computed)}
      onFocus={() => {
        setDraft(raw === null || raw === undefined ? "" : String(raw));
        setEditing(true);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
      aria-label="Table cell"
      className={cn(
        "w-full min-w-0 bg-transparent px-1.5 py-1 text-xs outline-none",
        (kind === "number" || kind === "currency") && !editing && "text-right",
        computed.error && !editing && "text-destructive",
        isFormula(raw) && !editing && "text-primary",
      )}
    />
  );
}
