// Client-safe helpers to build/interpret the RRULE string from the dialog's
// simple recurrence presets (no rrule import — keeps the bundle small).

export type RecurrencePreset =
  | "none"
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "yearly";

export const RECURRENCE_OPTIONS: { value: RecurrencePreset; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Every weekday (Mon–Fri)" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const BASE: Record<Exclude<RecurrencePreset, "none">, string> = {
  daily: "FREQ=DAILY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};

// untilDate: "yyyy-MM-dd" (local) or empty.
export function buildRRule(
  preset: RecurrencePreset,
  untilDate?: string,
): string | null {
  if (preset === "none") return null;
  let rule = BASE[preset];
  if (untilDate) {
    const d = new Date(`${untilDate}T23:59:59`);
    if (!isNaN(d.getTime())) {
      rule += `;UNTIL=${d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}`;
    }
  }
  return rule;
}

export function detectPreset(rule: string | null): RecurrencePreset {
  if (!rule) return "none";
  const up = rule.toUpperCase();
  if (up.includes("BYDAY=MO,TU,WE,TH,FR")) return "weekdays";
  if (up.includes("FREQ=DAILY")) return "daily";
  if (up.includes("FREQ=WEEKLY")) return "weekly";
  if (up.includes("FREQ=MONTHLY")) return "monthly";
  if (up.includes("FREQ=YEARLY")) return "yearly";
  return "weekly";
}

export function detectUntil(rule: string | null): string {
  if (!rule) return "";
  const m = /UNTIL=(\d{8})/.exec(rule);
  if (!m) return "";
  const s = m[1];
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}
