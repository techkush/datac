"use client";

import * as React from "react";
import {
  Code2,
  Copy,
  FileArchive,
  FolderOpen,
  SquareTerminal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDuration } from "@/lib/datac/format";
import type { WorkspaceRow } from "@/components/workspaces/workspaces-list";

// Emerald data color — validated against both light (#fcfcfb) and dark
// (#1a1a19) chart surfaces (lightness band, chroma, ≥3:1 contrast).
const BAR = "#059669";

const RANGES = [7, 14, 30] as const;

interface DayPoint {
  key: string; // YYYY-MM-DD (local)
  label: string; // sparse x-axis label ("" = no label)
  tooltip: string; // full date for the hover layer
  seconds: number;
}

function localKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Last N local days ending today, joined with the day-bucketed log.
function buildSeries(
  days: Record<string, number>,
  n: number,
): DayPoint[] {
  const out: DayPoint[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = localKey(d);
    const idx = n - 1 - i;
    let label = "";
    if (n === 7) label = d.toLocaleDateString(undefined, { weekday: "short" });
    else if (n === 14) label = idx % 2 === 0 ? String(d.getDate()) : "";
    else label = idx % 5 === 0 ? String(d.getDate()) : "";
    out.push({
      key,
      label,
      tooltip: d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      seconds: days[key] || 0,
    });
  }
  return out;
}

// Round the axis max up to a clean duration so ticks read as 0 / half / max.
const NICE_MINUTES = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 720, 1440];
function niceMaxSeconds(maxSeconds: number): number {
  if (maxSeconds <= 60) return 60;
  const minutes = maxSeconds / 60;
  for (const m of NICE_MINUTES) if (m >= minutes) return m * 60;
  return Math.ceil(minutes / 1440) * 1440 * 60;
}

function FocusChart({ series }: { series: DayPoint[] }) {
  const max = Math.max(...series.map((p) => p.seconds));
  const axisMax = niceMaxSeconds(max);
  const peakIndex = max > 0 ? series.findIndex((p) => p.seconds === max) : -1;

  if (max === 0) {
    return (
      <div className="text-muted-foreground flex h-44 items-center justify-center rounded-lg border border-dashed text-sm">
        No focus time recorded in this period.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        {/* y-axis ticks: 0 / half / max, clean durations */}
        <div className="text-muted-foreground flex h-40 w-9 flex-col justify-between text-right text-[10px] tabular-nums">
          <span>{formatDuration(axisMax)}</span>
          <span>{formatDuration(axisMax / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative h-40 flex-1">
          {/* recessive hairline gridlines */}
          <div className="border-border/60 absolute inset-x-0 top-0 border-t" />
          <div className="border-border/60 absolute inset-x-0 top-1/2 border-t" />
          <div className="border-border absolute inset-x-0 bottom-0 border-t" />
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {series.map((p, i) => {
              const h = (p.seconds / axisMax) * 100;
              return (
                <div
                  key={p.key}
                  className="group relative flex h-full flex-1 items-end justify-center"
                >
                  {/* selective direct label: the peak bar only */}
                  {i === peakIndex && (
                    <span
                      className="text-foreground absolute -top-4 text-[10px] font-medium whitespace-nowrap"
                    >
                      {formatDuration(p.seconds)}
                    </span>
                  )}
                  <div
                    className="w-full max-w-6 rounded-t-[4px]"
                    style={{
                      backgroundColor: BAR,
                      height: p.seconds > 0 ? `max(${h}%, 2px)` : "0",
                    }}
                  />
                  {/* hover layer: full-slot hit target, per-mark tooltip */}
                  <div
                    className={`bg-popover text-popover-foreground pointer-events-none absolute -top-9 z-10 hidden rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-sm group-hover:block ${
                      i < series.length / 3
                        ? "left-0"
                        : i > (2 * series.length) / 3
                          ? "right-0"
                          : "left-1/2 -translate-x-1/2"
                    }`}
                  >
                    {p.tooltip} · {formatDuration(p.seconds)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-11 flex gap-[2px]">
        {series.map((p) => (
          <span
            key={p.key}
            className="text-muted-foreground flex-1 truncate text-center text-[10px]"
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatsPanel({
  target,
  onClose,
}: {
  target: WorkspaceRow | null;
  onClose: () => void;
}) {
  const [range, setRange] = React.useState<number>(7);
  // Tag the fetched buckets with their workspace id so a stale result
  // never renders for a different workspace (and no sync reset is needed).
  const [data, setData] = React.useState<{
    id: string;
    days: Record<string, number>;
  } | null>(null);

  React.useEffect(() => {
    if (!target) return;
    const id = target.id;
    fetch(`/api/workspaces/${id}/focus`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { days: Record<string, number> }) =>
        setData({ id, days: d.days }),
      )
      .catch(() => {
        setData({ id, days: {} });
        toast.error("Could not load focus statistics");
      });
  }, [target]);

  const days = target && data?.id === target.id ? data.days : null;

  const series = React.useMemo(
    () => buildSeries(days || {}, range),
    [days, range],
  );
  const periodTotal = series.reduce((a, p) => a + p.seconds, 0);

  async function runAction(action: "vscode" | "terminal") {
    if (!target) return;
    try {
      const r = await fetch(`/api/w/${target.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!r.ok) throw new Error();
    } catch {
      toast.error(
        action === "vscode"
          ? "Could not open VS Code"
          : "Could not open Terminal",
      );
    }
  }

  async function openFolder() {
    if (!target) return;
    try {
      const r = await fetch(`/api/w/${target.id}/reveal`, { method: "POST" });
      if (!r.ok) throw new Error();
    } catch {
      toast.error("Could not open the project folder");
    }
  }

  async function copyPath() {
    if (!target) return;
    try {
      const r = await fetch(`/api/w/${target.id}/info`);
      if (!r.ok) throw new Error();
      const info = (await r.json()) as { projectDir?: string };
      if (!info.projectDir) throw new Error();
      await navigator.clipboard.writeText(info.projectDir);
      toast.success("Project path copied");
    } catch {
      toast.error("Could not copy the project path");
    }
  }

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{target?.title}</SheetTitle>
          <SheetDescription>
            Focus time from open workspace sessions.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6">
          <Tabs
            value={String(range)}
            onValueChange={(v) => setRange(Number(v))}
          >
            <TabsList>
              {RANGES.map((n) => (
                <TabsTrigger key={n} value={String(n)}>
                  {n} days
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* stat tile: total focus in the selected period */}
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">
              Focus in the last {range} days
            </span>
            <span className="text-2xl font-semibold">
              {formatDuration(periodTotal)}
            </span>
          </div>

          {days === null ? (
            <div className="bg-muted/50 h-44 animate-pulse rounded-lg" />
          ) : (
            <FocusChart series={series} />
          )}

          <div className="border-t" />

          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Project actions
            </span>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => runAction("vscode")}
            >
              <Code2 className="size-4" /> Open in VS Code
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => runAction("terminal")}
            >
              <SquareTerminal className="size-4" /> Open Terminal here
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <a href={target ? `/api/w/${target.id}/export` : "#"} download>
                <FileArchive className="size-4" /> Export ZIP
              </a>
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={openFolder}
            >
              <FolderOpen className="size-4" /> Open project folder
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={copyPath}
            >
              <Copy className="size-4" /> Copy project path
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
