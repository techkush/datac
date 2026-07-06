// Date math + event layout for the calendar views. All grid/range logic lives
// here so the view components stay declarative.
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { CalendarView } from "./constants";
import type { CalendarEvent } from "./types";

type WeekStart = 0 | 1;

export function viewRange(
  view: CalendarView,
  cursor: Date,
  weekStartsOn: WeekStart,
): { start: Date; end: Date } {
  switch (view) {
    case "day":
      return { start: startOfDay(cursor), end: endOfDay(cursor) };
    case "week":
      return {
        start: startOfWeek(cursor, { weekStartsOn }),
        end: endOfWeek(cursor, { weekStartsOn }),
      };
    case "agenda":
      return { start: startOfDay(cursor), end: endOfDay(addDays(cursor, 30)) };
    case "month":
    default: {
      const first = startOfWeek(startOfMonth(cursor), { weekStartsOn });
      const last = endOfWeek(endOfMonth(cursor), { weekStartsOn });
      return { start: first, end: last };
    }
  }
}

export function stepCursor(
  view: CalendarView,
  cursor: Date,
  dir: -1 | 1,
): Date {
  switch (view) {
    case "day":
      return addDays(cursor, dir);
    case "week":
      return addWeeks(cursor, dir);
    case "agenda":
      return addDays(cursor, dir * 7);
    case "month":
    default:
      return addMonths(cursor, dir);
  }
}

export function monthWeeks(cursor: Date, weekStartsOn: WeekStart): Date[][] {
  const { start, end } = viewRange("month", cursor, weekStartsOn);
  const days = eachDayOfInterval({ start, end });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function weekDays(cursor: Date, weekStartsOn: WeekStart): Date[] {
  const start = startOfWeek(cursor, { weekStartsOn });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function eventStart(e: CalendarEvent): Date {
  return new Date(e.startsAt);
}
export function eventEnd(e: CalendarEvent): Date {
  return new Date(e.endsAt);
}

// Events that intersect a given calendar day.
export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const s = startOfDay(day).getTime();
  const e = endOfDay(day).getTime();
  return events
    .filter((ev) => {
      const es = eventStart(ev).getTime();
      const ee = eventEnd(ev).getTime();
      return es <= e && ee >= s;
    })
    .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
}

// Timed (non-all-day) events for a day, used by day/week grids.
export function timedEventsOnDay(
  events: CalendarEvent[],
  day: Date,
): CalendarEvent[] {
  return eventsOnDay(events, day).filter((e) => !e.allDay);
}

export function allDayEventsOnDay(
  events: CalendarEvent[],
  day: Date,
): CalendarEvent[] {
  return eventsOnDay(events, day).filter((e) => e.allDay);
}

// Vertical placement (%) of a timed event within a single day column.
export interface PositionedEvent {
  event: CalendarEvent;
  topPct: number;
  heightPct: number;
  column: number;
  columns: number;
}

const DAY_MINUTES = 24 * 60;

export function layoutDay(
  events: CalendarEvent[],
  day: Date,
): PositionedEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const timed = timedEventsOnDay(events, day);

  // Clamp to the day and compute minute offsets.
  const items = timed.map((event) => {
    const s = Math.max(eventStart(event).getTime(), dayStart.getTime());
    const e = Math.min(eventEnd(event).getTime(), dayEnd.getTime());
    const startMin = differenceInMinutes(new Date(s), dayStart);
    const endMin = Math.max(startMin + 15, differenceInMinutes(new Date(e), dayStart));
    return { event, startMin, endMin };
  });

  // Greedy column assignment for overlapping events.
  items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const columnEnds: number[] = [];
  const assigned = items.map((it) => {
    let col = columnEnds.findIndex((end) => end <= it.startMin);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(it.endMin);
    } else {
      columnEnds[col] = it.endMin;
    }
    return { ...it, column: col };
  });

  // Total columns = max concurrency across the cluster (simple approximation:
  // number of columns used).
  const columns = Math.max(1, columnEnds.length);

  return assigned.map((it) => ({
    event: it.event,
    topPct: (it.startMin / DAY_MINUTES) * 100,
    heightPct: ((it.endMin - it.startMin) / DAY_MINUTES) * 100,
    column: it.column,
    columns,
  }));
}

export {
  isSameDay,
  isSameMonth,
  startOfDay,
  endOfDay,
  startOfWeek,
  addDays,
  differenceInMinutes,
};
