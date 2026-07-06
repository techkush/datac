"use client";

import * as React from "react";
import {
  format,
  isSameDay,
  isSameMonth,
  isToday,
  set,
  differenceInMilliseconds,
} from "date-fns";
import { monthWeeks, eventsOnDay } from "@/lib/calendar/dates";
import { eventColor } from "@/lib/calendar/color";
import { useCalendar } from "../store";
import type { CalendarEvent } from "@/lib/calendar/types";

const MAX_CHIPS = 3;

export function MonthView() {
  const {
    cursor,
    weekStartsOn,
    visibleEvents,
    categories,
    openEdit,
    openNew,
    moveEvent,
    setCursor,
    setView,
  } = useCalendar();
  const [dragId, setDragId] = React.useState<string | null>(null);

  const weeks = monthWeeks(cursor, weekStartsOn);
  const dow = weekStartsOn === 1
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const onDrop = (day: Date) => {
    if (!dragId) return;
    const ev = visibleEvents.find((e) => e.id === dragId);
    setDragId(null);
    if (!ev) return;
    const start = new Date(ev.startsAt);
    const duration = differenceInMilliseconds(new Date(ev.endsAt), start);
    const newStart = set(start, {
      year: day.getFullYear(),
      month: day.getMonth(),
      date: day.getDate(),
    });
    if (isSameDay(newStart, start)) return;
    const scope =
      ev.recurrenceParentId || ev.recurrenceRule ? "occurrence" : undefined;
    moveEvent(ev.id, newStart, new Date(newStart.getTime() + duration), scope);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b">
        {dow.map((d) => (
          <div
            key={d}
            className="text-muted-foreground py-1.5 text-center text-[11px] font-medium uppercase"
          >
            {d}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.flat().map((day) => {
          const dayEvents = eventsOnDay(visibleEvents, day);
          const outside = !isSameMonth(day, cursor);
          const shown = dayEvents.slice(0, MAX_CHIPS);
          const extra = dayEvents.length - shown.length;
          return (
            <div
              key={day.toISOString()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(day)}
              onDoubleClick={() =>
                openNew({
                  start: set(day, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }),
                  end: set(day, { hours: 10, minutes: 0, seconds: 0, milliseconds: 0 }),
                })
              }
              className="group hover:bg-accent/30 min-h-0 min-w-0 border-b border-r p-1"
              style={outside ? { background: "var(--muted)", opacity: 0.6 } : undefined}
            >
              <div className="flex items-center justify-between px-0.5">
                <button
                  onClick={() => {
                    setCursor(day);
                    setView("day");
                  }}
                  data-today={isToday(day)}
                  className="data-[today=true]:bg-primary data-[today=true]:text-primary-foreground flex size-6 items-center justify-center rounded-full text-xs hover:underline"
                >
                  {day.getDate()}
                </button>
              </div>
              <div className="mt-0.5 space-y-0.5 overflow-hidden">
                {shown.map((ev) => (
                  <EventChip
                    key={ev.id}
                    event={ev}
                    color={eventColor(ev, categories)}
                    onDragStart={() => setDragId(ev.id)}
                    onClick={() => openEdit(ev)}
                  />
                ))}
                {extra > 0 && (
                  <button
                    onClick={() => {
                      setCursor(day);
                      setView("day");
                    }}
                    className="text-muted-foreground hover:text-foreground px-1 text-[11px]"
                  >
                    +{extra} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventChip({
  event,
  color,
  onDragStart,
  onClick,
}: {
  event: CalendarEvent;
  color: string;
  onDragStart: () => void;
  onClick: () => void;
}) {
  const done = event.status === "COMPLETED";
  const cancelled = event.status === "CANCELLED";
  const timeLabel = event.allDay ? "" : format(new Date(event.startsAt), "HH:mm");
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight"
      style={{
        background: event.allDay ? color : `${color}22`,
        color: event.allDay ? "#fff" : undefined,
        border: event.isTimeBlock ? `1px dashed ${color}` : undefined,
      }}
      title={event.isTimeBlock ? `${event.title} (time block)` : event.title}
    >
      {!event.allDay && (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
      )}
      {timeLabel && (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {timeLabel}
        </span>
      )}
      <span
        className="truncate"
        style={{
          textDecoration: done || cancelled ? "line-through" : undefined,
          opacity: done || cancelled ? 0.6 : 1,
        }}
      >
        {event.title}
      </span>
    </button>
  );
}
