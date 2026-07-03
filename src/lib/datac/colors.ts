// The fixed palette for workspace accent colors on the home page.
// Six light, vivid tones — bright enough to pop as an accent on both the
// light and dark card surfaces. Shared by the color picker UI and the API's
// server-side validation.

export interface WorkspaceColor {
  name: string;
  value: string;
}

export const WORKSPACE_COLORS: readonly WorkspaceColor[] = [
  { name: "Rose", value: "#fb7185" },
  { name: "Amber", value: "#fbbf24" },
  { name: "Emerald", value: "#34d399" },
  { name: "Teal", value: "#2dd4bf" },
  { name: "Sky", value: "#38bdf8" },
  { name: "Violet", value: "#a78bfa" },
] as const;

export function isWorkspaceColor(v: string): boolean {
  return WORKSPACE_COLORS.some((c) => c.value === v);
}
