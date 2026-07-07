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

// Category color palette — 14 distinct tones.
export const CALENDAR_COLORS = [
  "#ef4444", // red
  "#fb7185", // rose
  "#f472b6", // pink
  "#e879f9", // fuchsia
  "#a78bfa", // violet
  "#818cf8", // indigo
  "#60a5fa", // blue
  "#38bdf8", // sky
  "#22d3ee", // cyan
  "#2dd4bf", // teal
  "#34d399", // emerald
  "#a3e635", // lime
  "#fbbf24", // amber
  "#fb923c", // orange
] as const;

// Reminder options (minutes before start) for the dropdown.
export const REMINDER_PRESETS: { label: string; minutes: number }[] = [
  { label: "At time of event", minutes: 0 },
  { label: "5 minutes before", minutes: 5 },
  { label: "15 minutes before", minutes: 15 },
  { label: "30 minutes before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 1440 },
  { label: "3 days before", minutes: 4320 },
];

export type CalendarView = "day" | "week" | "month" | "agenda";
