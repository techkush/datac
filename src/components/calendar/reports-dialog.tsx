"use client";

import * as React from "react";
import { subDays } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { calendarApi } from "@/lib/calendar/api";
import { STATUS_DEFS } from "@/lib/calendar/constants";
import type { ReportSummary } from "@/lib/calendar/types";

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

export function ReportsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [days, setDays] = React.useState(30);
  const [data, setData] = React.useState<ReportSummary | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    const to = new Date();
    const from = subDays(to, days);
    calendarApi
      .getReport(from.toISOString(), to.toISOString())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, days]);

  const focusMin = data ? Math.round(data.focusSeconds / 60) : 0;
  const focusLabel =
    focusMin >= 60
      ? `${Math.floor(focusMin / 60)}h ${focusMin % 60}m`
      : `${focusMin}m`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reports</DialogTitle>
        </DialogHeader>

        <div className="bg-muted flex w-fit items-center rounded-md p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              data-active={days === r.days}
              className="data-[active=true]:bg-background data-[active=true]:text-foreground text-muted-foreground rounded px-2.5 py-1 text-xs font-medium data-[active=true]:shadow-sm"
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-muted-foreground py-8 text-center text-sm">
            Loading…
          </div>
        )}

        {!loading && data && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Events" value={String(data.totalEvents)} />
              <Stat label="Completed" value={String(data.completed)} />
              <Stat
                label="Completion"
                value={
                  data.completionRate === null ? "—" : `${data.completionRate}%`
                }
              />
              <Stat label="Focus time" value={focusLabel} />
              <Stat label="Pomodoros" value={String(data.pomodoroCompleted)} />
              <Stat label="Cycles" value={String(data.cyclesCompleted)} />
            </div>

            <div>
              <div className="text-muted-foreground mb-1.5 text-xs font-medium uppercase">
                By status
              </div>
              <div className="space-y-1">
                {STATUS_DEFS.map((s) => {
                  const count = data.statusCounts[s.key] || 0;
                  const pct =
                    data.totalEvents > 0
                      ? (count / data.totalEvents) * 100
                      : 0;
                  return (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-xs">{s.label}</span>
                      <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: s.color }}
                        />
                      </div>
                      <span className="text-muted-foreground w-6 text-right text-xs tabular-nums">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
