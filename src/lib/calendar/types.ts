// Client-safe shared types (no server imports).
import type { EventStatus } from "./constants";

export interface ReminderDTO {
  id?: string;
  minutesBefore: number;
  method: "PUSH" | "EMAIL";
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  location: string | null;
  startsAt: string; // ISO
  endsAt: string; // ISO
  allDay: boolean;
  timezone: string;
  color: string | null;
  categoryId: string | null;
  status: EventStatus;
  isTimeBlock: boolean;
  recurrenceRule: string | null;
  recurrenceParentId: string | null;
  originalStart: string | null;
  completedAt: string | null;
  actualSeconds: number;
  createdAt: string;
  updatedAt: string;
  reminders: ReminderDTO[];
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string | null;
}

export interface CalendarSettings {
  timezone: string;
  weekStartsOn: number;
  pomodoroWorkMinutes: number;
  pomodoroBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  pomodoroCyclesBeforeLongBreak: number;
  defaultReminderMinutes: number | null;
}

export interface PomodoroSession {
  id: string;
  eventId: string | null;
  workMinutes: number;
  breakMinutes: number;
  cyclesPlanned: number | null;
  cyclesCompleted: number;
  focusSeconds: number;
  startedAt: string;
  endedAt: string | null;
}

export interface ReportSummary {
  range: { from: string; to: string };
  totalEvents: number;
  statusCounts: Record<string, number>;
  completed: number;
  completionRate: number | null;
  focusSeconds: number;
  pomodoroSessions: number;
  pomodoroCompleted: number;
  cyclesCompleted: number;
}

export interface EventInput {
  title: string;
  description?: string | null;
  notes?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  timezone?: string;
  color?: string | null;
  categoryId?: string | null;
  status?: EventStatus;
  isTimeBlock?: boolean;
  recurrenceRule?: string | null;
  reminders?: { minutesBefore: number; method?: "PUSH" | "EMAIL" }[];
}
