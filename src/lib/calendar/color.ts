import type { CalendarEvent, Category } from "./types";

const DEFAULT_COLOR = "#38bdf8";

// Resolve the display color for an event: explicit override > category > default.
export function eventColor(
  event: Pick<CalendarEvent, "color" | "categoryId">,
  categories: Category[],
): string {
  if (event.color) return event.color;
  if (event.categoryId) {
    const cat = categories.find((c) => c.id === event.categoryId);
    if (cat) return cat.color;
  }
  return DEFAULT_COLOR;
}
