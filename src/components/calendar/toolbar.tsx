"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Pause, Plus, Timer } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCalendar } from "./store";
import { usePomodoro } from "./pomodoro";
import type { CalendarView } from "@/lib/calendar/constants";

function PomodoroButton() {
  const { open, openWidget, closeWidget, phase, running, secondsLeft } =
    usePomodoro();
  const active = phase !== "idle";
  const mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(
    secondsLeft % 60,
  ).padStart(2, "0")}`;
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={() => (open ? closeWidget() : openWidget())}
      title="Pomodoro focus timer"
    >
      <Timer className="size-4" />
      {active ? (
        <span className="flex items-center gap-1 tabular-nums">
          {mmss}
          {!running && <Pause className="size-3" />}
        </span>
      ) : (
        "Focus"
      )}
    </Button>
  );
}

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "agenda", label: "Agenda" },
];

function title(view: CalendarView, cursor: Date, weekStartsOn: 0 | 1): string {
  if (view === "month") return format(cursor, "MMMM yyyy");
  if (view === "day") return format(cursor, "EEEE, MMMM d, yyyy");
  if (view === "agenda") return `${format(cursor, "MMM d")} – next 30 days`;
  const s = startOfWeek(cursor, { weekStartsOn });
  const e = endOfWeek(cursor, { weekStartsOn });
  const sameMonth = format(s, "MMM") === format(e, "MMM");
  return sameMonth
    ? `${format(s, "MMM d")} – ${format(e, "d, yyyy")}`
    : `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
}

export function CalendarToolbar() {
  const { view, cursor, weekStartsOn, setView, goPrev, goNext, goToday, openNew } =
    useCalendar();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
      <Button size="sm" variant="outline" onClick={goToday}>
        Today
      </Button>
      <div className="flex items-center">
        <Button variant="ghost" size="icon" className="size-8" onClick={goPrev} aria-label="Previous">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={goNext} aria-label="Next">
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <h2 className="ml-1 min-w-0 truncate text-base font-semibold">
        {title(view, cursor, weekStartsOn)}
      </h2>

      <div className="ml-auto flex items-center gap-2">
        <div className="bg-muted flex items-center rounded-md p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              data-active={view === v.key}
              className="data-[active=true]:bg-background data-[active=true]:text-foreground text-muted-foreground rounded px-2.5 py-1 text-xs font-medium data-[active=true]:shadow-sm"
            >
              {v.label}
            </button>
          ))}
        </div>
        <PomodoroButton />
        <Button size="sm" onClick={() => openNew()}>
          <Plus className="size-4" /> New event
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
