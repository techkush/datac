// Client-safe calendar constants (no server/Prisma imports). Mirrors the
// Prisma enums so UI code can use them without pulling the DB client.

export const EVENT_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "MISSED",
  "CANCELLED",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface StatusDef {
  key: EventStatus;
  label: string;
  color: string;
}

export const STATUS_DEFS: StatusDef[] = [
  { key: "NOT_STARTED", label: "Not started", color: "#9ca3af" },
  { key: "IN_PROGRESS", label: "In progress", color: "#3b82f6" },
  { key: "PAUSED", label: "Paused", color: "#f59e0b" },
  { key: "COMPLETED", label: "Completed", color: "#22c55e" },
  { key: "MISSED", label: "Missed", color: "#ef4444" },
  { key: "CANCELLED", label: "Cancelled", color: "#6b7280" },
];

export function statusDef(key: string): StatusDef {
  return STATUS_DEFS.find((s) => s.key === key) || STATUS_DEFS[0];
}

// Category/event color palette (aligned with the app's workspace palette).
export const CALENDAR_COLORS = [
  "#fb7185", // rose
  "#fbbf24", // amber
  "#34d399", // emerald
  "#2dd4bf", // teal
  "#38bdf8", // sky
  "#a78bfa", // violet
  "#f472b6", // pink
  "#60a5fa", // blue
] as const;

// Reminder presets (minutes before start). null sentinel handled in UI as "custom".
export const REMINDER_PRESETS: { label: string; minutes: number }[] = [
  { label: "At time of event", minutes: 0 },
  { label: "5 minutes before", minutes: 5 },
  { label: "15 minutes before", minutes: 15 },
  { label: "30 minutes before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 1440 },
];

export type CalendarView = "day" | "week" | "month" | "agenda";
