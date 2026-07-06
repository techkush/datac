// Server-side helpers for event writes (shared by create/update routes).

export interface ReminderInput {
  minutesBefore: number;
  method: "PUSH" | "EMAIL";
}

// Builds a Reminder create payload with the absolute fireAt precomputed, so the
// Phase 2 scheduler can query purely by time without recomputing offsets.
export function reminderCreateData(
  r: ReminderInput,
  startsAt: Date,
  userId: string,
) {
  return {
    userId,
    minutesBefore: r.minutesBefore,
    method: r.method,
    fireAt: new Date(startsAt.getTime() - r.minutesBefore * 60_000),
  };
}
