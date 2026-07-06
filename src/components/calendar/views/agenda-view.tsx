"use client";

import * as React from "react";
import { format, isToday } from "date-fns";
import { eachDayOfInterval } from "date-fns";
import { viewRange, eventsOnDay } from "@/lib/calendar/dates";
import { eventColor } from "@/lib/calendar/color";
import { statusDef } from "@/lib/calendar/constants";
import { useCalendar } from "../store";

export function AgendaView() {
  const { cursor, weekStartsOn, visibleEvents, categories, openEdit } =
    useCalendar();
  const { start, end } = viewRange("agenda", cursor, weekStartsOn);
  const days = eachDayOfInterval({ start, end }).filter(
    (d) => eventsOnDay(visibleEvents, d).length > 0,
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-4">
        {days.length === 0 && (
          <div className="text-muted-foreground py-16 text-center text-sm">
            No events in the next 30 days.
          </div>
        )}
        {days.map((day) => (
          <div key={day.toISOString()} className="flex gap-4 border-b py-3">
            <div className="w-20 shrink-0 text-right">
              <div className="text-muted-foreground text-[11px] uppercase">
                {format(day, "EEE")}
              </div>
              <div
                data-today={isToday(day)}
                className="data-[today=true]:text-primary text-lg font-semibold"
              >
                {format(day, "d")}
              </div>
              <div className="text-muted-foreground text-[11px]">
                {format(day, "MMM")}
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {eventsOnDay(visibleEvents, day).map((ev) => {
                const st = statusDef(ev.status);
                return (
                  <button
                    key={ev.id}
                    onClick={() => openEdit(ev)}
                    className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left"
                  >
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ background: eventColor(ev, categories) }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {ev.title}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {ev.allDay
                          ? "All day"
                          : `${format(new Date(ev.startsAt), "HH:mm")} – ${format(new Date(ev.endsAt), "HH:mm")}`}
                        {ev.location ? ` · ${ev.location}` : ""}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: `${st.color}22`, color: st.color }}
                    >
                      {st.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
