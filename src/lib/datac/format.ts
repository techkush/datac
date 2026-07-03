// Client-safe formatting helpers (no Node imports).

// "45s" · "12m" · "1h 20m" — compact focus-time label.
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

// "Jul 3, 2026 · 2:45 PM" — last-opened label for workspace cards.
export function formatOpened(iso: string | undefined): string {
  if (!iso) return "never opened";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "never opened";
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}
