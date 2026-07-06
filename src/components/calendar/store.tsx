"use client";

import * as React from "react";
import { toast } from "sonner";
import { calendarApi } from "@/lib/calendar/api";
import { viewRange, stepCursor } from "@/lib/calendar/dates";
import type { CalendarView } from "@/lib/calendar/constants";
import type { CalendarEvent, Category, EventInput } from "@/lib/calendar/types";

export interface CalendarUser {
  id: string;
  email: string;
  name: string | null;
}

interface DialogState {
  open: boolean;
  event: CalendarEvent | null; // null = creating
  draftStart?: string;
  draftEnd?: string;
  draftAllDay?: boolean;
}

interface CalendarCtx {
  user: CalendarUser;
  weekStartsOn: 0 | 1;
  view: CalendarView;
  cursor: Date;
  events: CalendarEvent[];
  categories: Category[];
  hiddenCategories: Set<string>;
  loading: boolean;

  setView: (v: CalendarView) => void;
  goToday: () => void;
  goPrev: () => void;
  goNext: () => void;
  setCursor: (d: Date) => void;
  reload: () => Promise<void>;

  toggleCategory: (id: string) => void;
  visibleEvents: CalendarEvent[];

  dialog: DialogState;
  openNew: (opts?: {
    start?: Date;
    end?: Date;
    allDay?: boolean;
  }) => void;
  openEdit: (event: CalendarEvent) => void;
  closeDialog: () => void;

  saveEvent: (
    input: EventInput,
    id?: string,
    scope?: "occurrence" | "all",
  ) => Promise<void>;
  deleteEvent: (id: string, scope?: "occurrence" | "all") => Promise<void>;
  moveEvent: (
    id: string,
    startsAt: Date,
    endsAt: Date,
    scope?: "occurrence" | "all",
  ) => Promise<void>;
  addCategory: (name: string, color: string) => Promise<void>;
}

const Ctx = React.createContext<CalendarCtx | null>(null);

export function useCalendar(): CalendarCtx {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useCalendar must be used within CalendarProvider");
  return v;
}

const VIEW_KEY = "datac:calendar:view";

export function CalendarProvider({
  user,
  weekStartsOn,
  initialCategories,
  children,
}: {
  user: CalendarUser;
  weekStartsOn: 0 | 1;
  initialCategories: Category[];
  children: React.ReactNode;
}) {
  const [view, setViewState] = React.useState<CalendarView>("month");
  const [cursor, setCursor] = React.useState<Date>(() => new Date());
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [categories, setCategories] =
    React.useState<Category[]>(initialCategories);
  const [hiddenCategories, setHidden] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [dialog, setDialog] = React.useState<DialogState>({
    open: false,
    event: null,
  });

  // Restore last-used view.
  React.useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY) as CalendarView | null;
      if (v && ["day", "week", "month", "agenda"].includes(v)) setViewState(v);
    } catch {}
  }, []);

  const setView = React.useCallback((v: CalendarView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }, []);

  const reload = React.useCallback(async () => {
    const { start, end } = viewRange(view, cursor, weekStartsOn);
    setLoading(true);
    try {
      const evs = await calendarApi.listEvents(
        start.toISOString(),
        end.toISOString(),
      );
      setEvents(evs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [view, cursor, weekStartsOn]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const goToday = React.useCallback(() => setCursor(new Date()), []);
  const goPrev = React.useCallback(
    () => setCursor((c) => stepCursor(view, c, -1)),
    [view],
  );
  const goNext = React.useCallback(
    () => setCursor((c) => stepCursor(view, c, 1)),
    [view],
  );

  const toggleCategory = React.useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visibleEvents = React.useMemo(
    () =>
      events.filter(
        (e) => !e.categoryId || !hiddenCategories.has(e.categoryId),
      ),
    [events, hiddenCategories],
  );

  const openNew = React.useCallback(
    (opts?: { start?: Date; end?: Date; allDay?: boolean }) => {
      setDialog({
        open: true,
        event: null,
        draftStart: opts?.start?.toISOString(),
        draftEnd: opts?.end?.toISOString(),
        draftAllDay: opts?.allDay,
      });
    },
    [],
  );
  const openEdit = React.useCallback(
    (event: CalendarEvent) => setDialog({ open: true, event }),
    [],
  );
  const closeDialog = React.useCallback(
    () => setDialog({ open: false, event: null }),
    [],
  );

  const saveEvent = React.useCallback(
    async (input: EventInput, id?: string, scope?: "occurrence" | "all") => {
      try {
        if (id) {
          await calendarApi.updateEvent(id, input, scope);
          toast.success("Event updated");
        } else {
          await calendarApi.createEvent(input);
          toast.success("Event created");
        }
        closeDialog();
        await reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
        throw e;
      }
    },
    [closeDialog, reload],
  );

  const deleteEvent = React.useCallback(
    async (id: string, scope?: "occurrence" | "all") => {
      // Optimistic removal.
      setEvents((prev) => prev.filter((e) => e.id !== id));
      try {
        await calendarApi.deleteEvent(id, scope);
        toast.success("Event deleted");
        closeDialog();
        await reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
        await reload();
      }
    },
    [closeDialog, reload],
  );

  const moveEvent = React.useCallback(
    async (
      id: string,
      startsAt: Date,
      endsAt: Date,
      scope?: "occurrence" | "all",
    ) => {
      // Optimistic reschedule.
      setEvents((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }
            : e,
        ),
      );
      try {
        await calendarApi.updateEvent(
          id,
          {
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
          },
          scope,
        );
        await reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Reschedule failed");
        await reload();
      }
    },
    [reload],
  );

  const addCategory = React.useCallback(async (name: string, color: string) => {
    try {
      const cat = await calendarApi.createCategory({ name, color });
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success("Category added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add category");
    }
  }, []);

  const value: CalendarCtx = {
    user,
    weekStartsOn,
    view,
    cursor,
    events,
    categories,
    hiddenCategories,
    loading,
    setView,
    goToday,
    goPrev,
    goNext,
    setCursor,
    reload,
    toggleCategory,
    visibleEvents,
    dialog,
    openNew,
    openEdit,
    closeDialog,
    saveEvent,
    deleteEvent,
    moveEvent,
    addCategory,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
