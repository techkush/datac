// Zod request schemas + DTO serializers shared by the calendar API routes.
import { z } from "zod";
import { EVENT_STATUSES } from "./constants";

const isoDate = z.string().datetime({ offset: true }).or(z.string().datetime());

export const reminderInput = z.object({
  minutesBefore: z.number().int().min(0).max(60 * 24 * 30),
  method: z.enum(["PUSH", "EMAIL"]).default("PUSH"),
});

export const eventCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(500),
    description: z.string().max(5000).optional().nullable(),
    notes: z.string().max(20000).optional().nullable(),
    location: z.string().max(1000).optional().nullable(),
    startsAt: isoDate,
    endsAt: isoDate,
    allDay: z.boolean().default(false),
    timezone: z.string().default("UTC"),
    color: z.string().max(32).optional().nullable(),
    categoryId: z.string().optional().nullable(),
    status: z.enum(EVENT_STATUSES).default("NOT_STARTED"),
    isTimeBlock: z.boolean().default(false),
    recurrenceRule: z.string().max(1000).optional().nullable(),
    reminders: z.array(reminderInput).max(10).optional(),
  })
  .refine((v) => new Date(v.endsAt) >= new Date(v.startsAt), {
    message: "endsAt must be at or after startsAt",
    path: ["endsAt"],
  });

export const eventUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().max(5000).optional().nullable(),
    notes: z.string().max(20000).optional().nullable(),
    location: z.string().max(1000).optional().nullable(),
    startsAt: isoDate.optional(),
    endsAt: isoDate.optional(),
    allDay: z.boolean().optional(),
    timezone: z.string().optional(),
    color: z.string().max(32).optional().nullable(),
    categoryId: z.string().optional().nullable(),
    status: z.enum(EVENT_STATUSES).optional(),
    isTimeBlock: z.boolean().optional(),
    recurrenceRule: z.string().max(1000).optional().nullable(),
    reminders: z.array(reminderInput).max(10).optional(),
  })
  .refine(
    (v) =>
      !v.startsAt || !v.endsAt || new Date(v.endsAt) >= new Date(v.startsAt),
    { message: "endsAt must be at or after startsAt", path: ["endsAt"] },
  );

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().max(32).default("#38bdf8"),
  icon: z.string().max(32).optional().nullable(),
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  color: z.string().max(32).optional(),
  icon: z.string().max(32).optional().nullable(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const settingsUpdateSchema = z.object({
  timezone: z.string().max(64).optional(),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]).optional(),
  pomodoroWorkMinutes: z.number().int().min(1).max(180).optional(),
  pomodoroBreakMinutes: z.number().int().min(1).max(60).optional(),
  pomodoroLongBreakMinutes: z.number().int().min(1).max(120).optional(),
  pomodoroCyclesBeforeLongBreak: z.number().int().min(1).max(12).optional(),
  defaultReminderMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
});

export const pomodoroCreateSchema = z.object({
  eventId: z.string().optional().nullable(),
  workMinutes: z.number().int().min(1).max(180),
  breakMinutes: z.number().int().min(1).max(60),
  cyclesPlanned: z.number().int().min(1).max(24).optional().nullable(),
});

export const pomodoroUpdateSchema = z.object({
  cyclesCompleted: z.number().int().min(0).max(100).optional(),
  focusSeconds: z.number().int().min(0).max(60 * 60 * 24).optional(),
  ended: z.boolean().optional(),
});

// --- Mobile / device sync --------------------------------------------------
export const deviceRegisterSchema = z.object({
  fcmToken: z.string().min(10).max(4096),
  platform: z.enum(["ANDROID", "IOS", "WEB"]).default("ANDROID"),
  name: z.string().max(120).optional().nullable(),
});

export const statusUpdateSchema = z.object({
  status: z.enum(EVENT_STATUSES),
  note: z.string().max(2000).optional().nullable(),
  at: isoDate.optional(), // when the change happened on the device
  actualSecondsDelta: z.number().int().min(0).max(60 * 60 * 24).optional(),
});

const activityInput = z.object({
  type: z.string().min(1).max(64),
  eventId: z.string().optional().nullable(),
  at: isoDate.optional(),
  data: z.record(z.string(), z.unknown()).optional().nullable(),
});

const pomodoroSyncInput = z.object({
  eventId: z.string().optional().nullable(),
  workMinutes: z.number().int().min(1).max(180),
  breakMinutes: z.number().int().min(1).max(60),
  cyclesCompleted: z.number().int().min(0).max(100).optional(),
  focusSeconds: z.number().int().min(0).max(60 * 60 * 24).optional(),
  startedAt: isoDate.optional(),
  endedAt: isoDate.optional(),
});

// Batch reconciliation the Flutter app posts (possibly after being offline).
export const batchSyncSchema = z.object({
  statusUpdates: z
    .array(statusUpdateSchema.extend({ eventId: z.string() }))
    .max(500)
    .optional(),
  activity: z.array(activityInput).max(1000).optional(),
  pomodoro: z.array(pomodoroSyncInput).max(200).optional(),
});

// --- Serializers -----------------------------------------------------------
// Keep Date -> ISO string conversion in one place so every client (web +
// mobile) receives an identical shape.

type EventWithRelations = {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timezone: string;
  color: string | null;
  categoryId: string | null;
  status: string;
  isTimeBlock: boolean;
  recurrenceRule: string | null;
  recurrenceParentId: string | null;
  originalStart: Date | null;
  completedAt: Date | null;
  actualSeconds: number;
  createdAt: Date;
  updatedAt: Date;
  reminders?: { id: string; minutesBefore: number; method: string }[];
};

export function serializeEvent(e: EventWithRelations) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    notes: e.notes,
    location: e.location,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    allDay: e.allDay,
    timezone: e.timezone,
    color: e.color,
    categoryId: e.categoryId,
    status: e.status,
    isTimeBlock: e.isTimeBlock,
    recurrenceRule: e.recurrenceRule,
    recurrenceParentId: e.recurrenceParentId,
    originalStart: e.originalStart ? e.originalStart.toISOString() : null,
    completedAt: e.completedAt ? e.completedAt.toISOString() : null,
    actualSeconds: e.actualSeconds,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    reminders: (e.reminders || []).map((r) => ({
      id: r.id,
      minutesBefore: r.minutesBefore,
      method: r.method,
    })),
  };
}

export type EventDTO = ReturnType<typeof serializeEvent>;

// A virtual occurrence of a recurring series. Shares the master's fields but
// carries the occurrence's own start/end and a composite id so clients can
// address it (edit/delete "this occurrence").
export function serializeOccurrence(
  master: EventWithRelations,
  id: string,
  occStart: Date,
  occEnd: Date,
) {
  return {
    ...serializeEvent(master),
    id,
    startsAt: occStart.toISOString(),
    endsAt: occEnd.toISOString(),
    recurrenceParentId: master.id,
    originalStart: occStart.toISOString(),
    // Occurrences don't carry their own status/completion; those live on
    // overrides. Reset so an old master status doesn't mislabel every instance.
    status: "NOT_STARTED",
    completedAt: null,
  };
}
