// Shared catalogues ported from the legacy editor.

export interface StatusDef {
  key: string;
  label: string;
  color: string;
}

export const STATUSES: StatusDef[] = [
  { key: "not-started", label: "Not started", color: "#9CA3AF" },
  { key: "writing", label: "Writing", color: "#3B82F6" },
  { key: "reviewing", label: "Reviewing", color: "#F59E0B" },
  { key: "revising", label: "Revising", color: "#F97316" },
  { key: "done", label: "Done", color: "#22C55E" },
];

export function statusInfo(key: string): StatusDef {
  return STATUSES.find((s) => s.key === key) || STATUSES[0];
}

export const BLOCK_COLORS = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
  "red",
] as const;

export type BlockColor = (typeof BLOCK_COLORS)[number];

export const COVERS = [
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#f093fb,#f5576c)",
  "linear-gradient(135deg,#4facfe,#00f2fe)",
  "linear-gradient(135deg,#43e97b,#38f9d7)",
  "linear-gradient(135deg,#fa709a,#fee140)",
  "linear-gradient(135deg,#30cfd0,#330867)",
  "linear-gradient(135deg,#a8edea,#fed6e3)",
  "linear-gradient(135deg,#ff9a9e,#fecfef)",
  "linear-gradient(135deg,#0f2027,#2c5364)",
  "linear-gradient(135deg,#f7971e,#ffd200)",
  "linear-gradient(135deg,#c471f5,#fa71cd)",
  "linear-gradient(135deg,#1e3c72,#2a5298)",
];

// prettier-ignore
export const EMOJIS = ["📄","📝","📌","📒","📓","📔","📕","📗","📘","📙","📚","🗒️","🗓️","📅","✅","⭐","🔥","💡","🚀","🎯","🎨","🧠","💼","📈","📊","🔬","🧪","⚙️","🛠️","🔖","🏷️","📎","✏️","🖊️","🗂️","📁","🔑","🔒","🌟","❤️","😀","😎","🤔","🙌","👍","🎉","☕","🌈","🌍","🏆","🧩","💬","📣","⏰","🗺️","💎","🪄","🧭","🦄","🍀","🌸","⚡","🎵","📷"];

export interface BlockTypeDef {
  type: string;
  label: string;
  desc: string;
  icon: string;
  keys: string;
  action?: string;
  n?: number;
}

export const BLOCK_TYPES: BlockTypeDef[] = [
  { type: "paragraph", label: "Text", desc: "Plain paragraph", icon: "¶", keys: "text paragraph" },
  { type: "page", label: "Page", desc: "A new sub-page inside this page", icon: "📄", keys: "page subpage child nested inside new", action: "page" },
  { type: "pagelink", label: "Link to page", desc: "Link to an existing page", icon: "🔗", keys: "link page existing reference navigate goto mention", action: "pagelink" },
  { type: "h1", label: "Heading 1", desc: "Large section heading", icon: "H₁", keys: "h1 title heading" },
  { type: "h2", label: "Heading 2", desc: "Medium heading", icon: "H₂", keys: "h2 heading" },
  { type: "h3", label: "Heading 3", desc: "Small heading", icon: "H₃", keys: "h3 heading" },
  { type: "h4", label: "Heading 4", desc: "Smallest heading", icon: "H₄", keys: "h4 heading" },
  { type: "bulleted", label: "Bulleted list", desc: "Simple bullet list", icon: "•", keys: "bullet unordered list ul" },
  { type: "numbered", label: "Numbered list", desc: "Ordered list", icon: "1.", keys: "number ordered list ol" },
  { type: "todo", label: "To-do list", desc: "Checkbox to track tasks", icon: "☑", keys: "todo check task box" },
  { type: "quote", label: "Quote", desc: "Capture a quotation", icon: "❝", keys: "quote blockquote" },
  { type: "code", label: "Code", desc: "Code block", icon: "</>", keys: "code snippet pre" },
  { type: "math", label: "Math / Equation", desc: "Paste & correct math (LaTeX)", icon: "∑", keys: "math equation formula latex tex katex correct paste", action: "math" },
  { type: "divider", label: "Divider", desc: "Horizontal rule", icon: "—", keys: "divider hr line rule", action: "divider" },
  { type: "image", label: "Image", desc: "Upload a picture", icon: "🖼", keys: "image picture photo figure", action: "image" },
  { type: "file", label: "File", desc: "Upload a file into dataC", icon: "📎", keys: "file attachment document upload", action: "file" },
  { type: "linkfile", label: "File link", desc: "Link a file by path (no copy)", icon: "🔗", keys: "link file path reference local open external", action: "linkfile" },
  { type: "columns2", label: "2 columns", desc: "Divide into two columns", icon: "▥", keys: "columns 2 two layout grid side", action: "columns", n: 2 },
  { type: "columns3", label: "3 columns", desc: "Divide into three columns", icon: "▥", keys: "columns 3 three layout grid side", action: "columns", n: 3 },
  { type: "columns4", label: "4 columns", desc: "Divide into four columns", icon: "▥", keys: "columns 4 four layout grid side", action: "columns", n: 4 },
];

export const TEXT_TYPES = new Set([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "h4",
  "bulleted",
  "numbered",
  "todo",
  "quote",
]);

export const PLACEHOLDERS: Record<string, string> = {
  paragraph: "Write something, or press '/' for commands",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  bulleted: "List",
  numbered: "List",
  todo: "To-do",
  quote: "Quote",
  code: "Code",
};

export function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}
