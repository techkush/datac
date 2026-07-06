// Recurring-event expansion. A recurring "series" is stored as one master Event
// carrying an RFC-5545 RRULE. Individual occurrences are virtual: expanded on
// read within the requested window. Two things detach an occurrence from the
// series:
//   - a RecurrenceException row  -> the occurrence is skipped (EXDATE)
//   - an override child Event    -> a concrete row (recurrenceParentId + originalStart)
//     that replaces the occurrence and is returned on its own.
import { rrulestr } from "rrule";
import { log } from "./logger";

const SEP = "::";

// Composite id for a virtual occurrence: "<masterId>::<occurrenceStartISO>".
export function occurrenceId(masterId: string, occStart: Date): string {
  return `${masterId}${SEP}${occStart.toISOString()}`;
}

export function parseOccurrenceId(
  id: string,
): { masterId: string; originalStart: Date } | null {
  const i = id.indexOf(SEP);
  if (i === -1) return null;
  const masterId = id.slice(0, i);
  const iso = id.slice(i + SEP.length);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return { masterId, originalStart: d };
}

// DTSTART line from a UTC instant: 20260707T140000Z
function toDtstart(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export interface MasterLite {
  id: string;
  startsAt: Date;
  endsAt: Date;
  recurrenceRule: string;
}

export interface Occurrence {
  masterId: string;
  startsAt: Date;
  endsAt: Date;
}

// Expand a series into occurrences overlapping [from, to], excluding EXDATEs and
// dates already replaced by an override child.
export function expandSeries(
  master: MasterLite,
  from: Date,
  to: Date,
  excluded: number[], // getTime() of occurrence starts to skip
): Occurrence[] {
  const durationMs = master.endsAt.getTime() - master.startsAt.getTime();
  let rule;
  try {
    rule = rrulestr(
      `DTSTART:${toDtstart(master.startsAt)}\nRRULE:${master.recurrenceRule}`,
    );
  } catch (e) {
    log.warn("Bad RRULE, treating as single event", {
      masterId: master.id,
      rule: master.recurrenceRule,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }

  // An occurrence overlaps [from,to] iff occStart <= to AND occStart >= from-duration.
  const winStart = new Date(from.getTime() - durationMs);
  const skip = new Set(excluded);

  let starts: Date[];
  try {
    starts = rule.between(winStart, to, true);
  } catch {
    return [];
  }

  const out: Occurrence[] = [];
  for (const d of starts) {
    const t = d.getTime();
    if (skip.has(t)) continue;
    out.push({
      masterId: master.id,
      startsAt: new Date(t),
      endsAt: new Date(t + durationMs),
    });
    if (out.length > 1000) break; // safety valve for pathological rules
  }
  return out;
}
