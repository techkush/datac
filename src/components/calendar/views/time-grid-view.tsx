"use client";

import * as React from "react";
import { format, isToday, set, differenceInMilliseconds } from "date-fns";
import {
  HOURS,
  weekDays,
  layoutDay,
  allDayEventsOnDay,
} from "@/lib/calendar/dates";
import { eventColor } from "@/lib/calendar/color";
import { useCalendar } from "../store";
import type { CalendarEvent } from "@/lib/calendar/types";

const HOUR_PX = 48;
const SNAP_MIN = 15;

interface DragState {
  event: CalendarEvent;
  pointerY: number;
  pointerX: number;
  deltaMin: number;
  dayShift: number;
  colWidth: number;
}

export function TimeGridView({ days }: { days: 1 | 7 }) {
  const {
    cursor,
    weekStartsOn,
    visibleEvents,
    categories,
    openEdit,
    openNew,
    moveEvent,
  } = useCalendar();

  const cols = days === 1 ? [cursor] : weekDays(cursor, weekStartsOn);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<DragState | null>(null);

  // Scroll to ~7am on mount / view change.
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_PX;
  }, [days]);

  // Pointer drag handling.
  React.useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const dy = e.clientY - drag.pointerY;
      const dx = e.clientX - drag.pointerX;
      const rawMin = (dy / HOUR_PX) * 60;
      const deltaMin = Math.round(rawMin / SNAP_MIN) * SNAP_MIN;
      const dayShift = days === 1 ? 0 : Math.round(dx / drag.colWidth);
      setDrag((d) => (d ? { ...d, deltaMin, dayShift } : d));
    };
    const up = () => {
      setDrag((d) => {
        if (d && (d.deltaMin !== 0 || d.dayShift !== 0)) {
          const start = new Date(d.event.startsAt);
          const dur = differenceInMilliseconds(new Date(d.event.endsAt), start);
          let ns = new Date(start.getTime() + d.deltaMin * 60_000);
          if (d.dayShift !== 0) {
            const target = cols[
              Math.min(
                Math.max(cols.findIndex((c) => sameDay(c, start)) + d.dayShift, 0),
                cols.length - 1,
              )
            ];
            // If the original day isn't in view, fall back to first column.
            const base = target || cols[0];
            ns = set(ns, {
              year: base.getFullYear(),
              month: base.getMonth(),
              date: base.getDate(),
            });
          }
          const scope =
            d.event.recurrenceParentId || d.event.recurrenceRule
              ? "occurrence"
              : undefined;
          moveEvent(d.event.id, ns, new Date(ns.getTime() + dur), scope);
        }
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, cols, days, moveEvent]);

  const createAt = (day: Date, clientY: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const minutes =
      Math.round((((clientY - rect.top) / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN;
    const start = set(day, {
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
      seconds: 0,
      milliseconds: 0,
    });
    openNew({ start, end: new Date(start.getTime() + 60 * 60_000) });
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {/* Header: sticky day names + all-day lane. Kept inside the same scroll
            container as the grid so the vertical scrollbar shrinks both equally
            and the columns stay aligned. */}
        <div
          className="bg-background sticky top-0 z-40 grid border-b"
          style={{ gridTemplateColumns: `56px repeat(${cols.length}, 1fr)` }}
        >
        <div className="border-r" />
        {cols.map((day) => (
          <div key={day.toISOString()} className="border-r px-1 py-1 text-center">
            <div className="text-muted-foreground text-[11px] uppercase">
              {format(day, "EEE")}
            </div>
            <div
              data-today={isToday(day)}
              className="data-[today=true]:bg-primary data-[today=true]:text-primary-foreground mx-auto flex size-7 items-center justify-center rounded-full text-sm font-medium"
            >
              {day.getDate()}
            </div>
            <div className="mt-0.5 space-y-0.5">
              {allDayEventsOnDay(visibleEvents, day).map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => openEdit(ev)}
                  className="w-full truncate rounded px-1 text-left text-[11px] text-white"
                  style={{ background: eventColor(ev, categories) }}
                >
                  {ev.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

        {/* time grid */}
        <div
          ref={gridRef}
          className="relative grid"
          style={{
            gridTemplateColumns: `56px repeat(${cols.length}, 1fr)`,
            height: 24 * HOUR_PX,
          }}
        >
          {/* Hour labels */}
          <div className="relative border-r">
            {HOURS.map((h) => (
              <div
                key={h}
                className="text-muted-foreground absolute right-1 -translate-y-1/2 text-[10px]"
                style={{ top: h * HOUR_PX }}
              >
                {h === 0 ? "" : format(set(new Date(), { hours: h, minutes: 0 }), "HH:mm")}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {cols.map((day) => {
            const positioned = layoutDay(visibleEvents, day);
            return (
              <div
                key={day.toISOString()}
                className="relative border-r"
                onClick={(e) => {
                  if (e.target === e.currentTarget)
                    createAt(day, e.clientY, e.currentTarget);
                }}
              >
                {/* Hour gridlines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="border-border/60 pointer-events-none absolute inset-x-0 border-t"
                    style={{ top: h * HOUR_PX }}
                  />
                ))}
                {isToday(day) && <NowLine />}

                {positioned.map((p) => {
                  const dragging = drag?.event.id === p.event.id;
                  const offsetY = dragging ? (drag!.deltaMin / 60) * HOUR_PX : 0;
                  const color = eventColor(p.event, categories);
                  const done = p.event.status === "COMPLETED";
                  return (
                    <button
                      key={p.event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!dragging) openEdit(p.event);
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDrag({
                          event: p.event,
                          pointerY: e.clientY,
                          pointerX: e.clientX,
                          deltaMin: 0,
                          dayShift: 0,
                          colWidth:
                            ((gridRef.current?.clientWidth ?? 700) - 56) /
                            Math.max(cols.length, 1),
                        });
                      }}
                      className="absolute overflow-hidden rounded px-1 py-0.5 text-left text-[11px] leading-tight text-white shadow-sm"
                      style={{
                        top: `calc(${p.topPct}% + ${offsetY}px)`,
                        height: `${p.heightPct}%`,
                        left: `calc(${(p.column / p.columns) * 100}% + 2px)`,
                        width: `calc(${100 / p.columns}% - 4px)`,
                        background: color,
                        backgroundImage: p.event.isTimeBlock
                          ? "repeating-linear-gradient(45deg, rgba(255,255,255,.28) 0 6px, transparent 6px 12px)"
                          : undefined,
                        opacity: done ? 0.6 : dragging ? 0.85 : 1,
                        zIndex: dragging ? 30 : 10,
                        cursor: "grab",
                        touchAction: "none",
                      }}
                      title={p.event.title}
                    >
                      <div
                        className="truncate font-medium"
                        style={{ textDecoration: done ? "line-through" : undefined }}
                      >
                        {p.event.title}
                      </div>
                      <div className="truncate opacity-90">
                        {format(new Date(p.event.startsAt), "HH:mm")}–
                        {format(new Date(p.event.endsAt), "HH:mm")}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function NowLine() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={{ top }}
    >
      <div className="size-2 rounded-full bg-red-500" />
      <div className="h-px flex-1 bg-red-500" />
    </div>
  );
}
