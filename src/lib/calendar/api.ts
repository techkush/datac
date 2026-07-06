// Browser-side API client for the calendar. Web auth rides on the httpOnly
// cookie (same-origin), so no token handling is needed here.
import type {
  CalendarEvent,
  Category,
  EventInput,
  CalendarSettings,
  PomodoroSession,
  ReportSummary,
} from "./types";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    credentials: "same-origin",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (body && (body.error as string)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export const calendarApi = {
  listEvents: (fromISO: string, toISO: string) =>
    req<{ events: CalendarEvent[] }>(
      `/api/calendar/events?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`,
    ).then((r) => r.events),

  createEvent: (input: EventInput) =>
    req<{ event: CalendarEvent }>(`/api/calendar/events`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.event),

  updateEvent: (
    id: string,
    input: Partial<EventInput>,
    scope?: "occurrence" | "all",
  ) =>
    req<{ event: CalendarEvent }>(
      `/api/calendar/events/${encodeURIComponent(id)}${scope ? `?scope=${scope}` : ""}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ).then((r) => r.event),

  deleteEvent: (id: string, scope?: "occurrence" | "all") =>
    req<{ ok: true }>(
      `/api/calendar/events/${encodeURIComponent(id)}${scope ? `?scope=${scope}` : ""}`,
      { method: "DELETE" },
    ),

  listCategories: () =>
    req<{ categories: Category[] }>(`/api/calendar/categories`).then(
      (r) => r.categories,
    ),

  createCategory: (input: { name: string; color: string }) =>
    req<{ category: Category }>(`/api/calendar/categories`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.category),

  updateCategory: (id: string, input: { name?: string; color?: string }) =>
    req<{ category: Category }>(`/api/calendar/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then((r) => r.category),

  deleteCategory: (id: string) =>
    req<{ ok: true }>(`/api/calendar/categories/${id}`, { method: "DELETE" }),

  getReport: (fromISO: string, toISO: string) =>
    req<ReportSummary>(
      `/api/calendar/reports/summary?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`,
    ),

  logout: () => req<{ ok: true }>(`/api/auth/logout`, { method: "POST" }),

  getSettings: () =>
    req<{ settings: CalendarSettings }>(`/api/calendar/settings`).then(
      (r) => r.settings,
    ),

  updateSettings: (input: Partial<CalendarSettings>) =>
    req<{ settings: CalendarSettings }>(`/api/calendar/settings`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then((r) => r.settings),

  startPomodoro: (input: {
    eventId?: string | null;
    workMinutes: number;
    breakMinutes: number;
    cyclesPlanned?: number | null;
  }) =>
    req<{ session: PomodoroSession }>(`/api/calendar/pomodoro/sessions`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.session),

  updatePomodoro: (
    id: string,
    input: { cyclesCompleted?: number; focusSeconds?: number; ended?: boolean },
  ) =>
    req<{ session: PomodoroSession }>(
      `/api/calendar/pomodoro/sessions/${id}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ).then((r) => r.session),
};
