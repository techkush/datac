"use client";

// Notion-style block options menu for the drag handle: searchable actions,
// Turn into ▸, Color ▸, duplicate / insert / move / copy actions, move to
// page, copy link to block, and type-specific extras.

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ClipboardCopy,
  Code2,
  CornerDownLeft,
  CornerUpLeft,
  Copy,
  ExternalLink,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  ListCollapse,
  MessageSquareText,
  Pilcrow,
  Quote,
  Repeat2,
  SquareSigma,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import {
  useComponentsContext,
  useBlockNoteEditor,
  useExtensionState,
  BlockColorsItem,
} from "@blocknote/react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { Input } from "@/components/ui/input";
import { useEditor } from "./store";
import { blockNoteToMd, type BnBlock } from "@/lib/datac/blocknote-convert";

/* ---- helpers -------------------------------------------------------------- */

type AnyBlock = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: unknown;
  children?: AnyBlock[];
};

const TURNABLE = new Set([
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "toggleListItem",
  "quote",
  "codeBlock",
]);

const TURN_TARGETS: Array<{
  label: string;
  icon: React.ElementType;
  type: string;
  props?: Record<string, unknown>;
}> = [
  { label: "Text", icon: Pilcrow, type: "paragraph" },
  { label: "Heading 1", icon: Heading1, type: "heading", props: { level: 1 } },
  { label: "Heading 2", icon: Heading2, type: "heading", props: { level: 2 } },
  { label: "Heading 3", icon: Heading3, type: "heading", props: { level: 3 } },
  { label: "Heading 4", icon: Heading4, type: "heading", props: { level: 4 } },
  { label: "Bulleted list", icon: List, type: "bulletListItem" },
  { label: "Numbered list", icon: ListOrdered, type: "numberedListItem" },
  { label: "To-do list", icon: ListTodo, type: "checkListItem" },
  { label: "Toggle list", icon: ListCollapse, type: "toggleListItem" },
  { label: "Quote", icon: Quote, type: "quote" },
  { label: "Code", icon: Code2, type: "codeBlock" },
];

function isTurnTarget(block: AnyBlock, t: (typeof TURN_TARGETS)[number]) {
  if (block.type !== t.type) return false;
  if (t.type === "heading")
    return Number(block.props.level || 1) === t.props?.level;
  return true;
}

// Fresh random ids for a duplicated subtree.
function cloneWithNewIds(b: AnyBlock): AnyBlock {
  return {
    ...b,
    id: crypto.randomUUID(),
    children: (b.children || []).map(cloneWithNewIds),
  };
}

// Plain text of a block's inline content (links flattened).
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const c of content as Array<{
    type?: string;
    text?: string;
    content?: unknown;
  }>) {
    if (c.type === "text") out += c.text || "";
    else if (c.type === "link") out += extractText(c.content);
  }
  return out;
}

async function copyToClipboard(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Copy failed");
  }
}

/* ---- the menu -------------------------------------------------------------- */

export interface BlockOptionsHandlers {
  onOpenComments: (blockId: string) => void;
  onEditMath: (blockId: string, tex: string) => void;
  onMoveTo: (blockId: string) => void;
}

interface Action {
  key: string;
  label: string;
  icon: React.ElementType;
  run: () => void;
  destructive?: boolean;
}

export function BlockOptionsMenu(handlers: BlockOptionsHandlers) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const store = useEditor();
  const [query, setQuery] = React.useState("");

  const block = useExtensionState(SideMenuExtension, {
    selector: (state) => state?.block,
  }) as AnyBlock | undefined;

  if (!block) return null;

  const fresh = () => (editor.getBlock(block.id) as AnyBlock) || block;
  const commentCount = store.comments[block.id]?.length || 0;

  const turnInto = (t: (typeof TURN_TARGETS)[number]) => {
    editor.updateBlock(block.id, {
      type: t.type,
      props: t.props,
    } as never);
  };

  const actions: Action[] = [
    {
      key: "comment",
      label: commentCount ? `Comments (${commentCount})` : "Add comment",
      icon: MessageSquareText,
      run: () => handlers.onOpenComments(block.id),
    },
    {
      key: "duplicate",
      label: "Duplicate",
      icon: Copy,
      run: () => {
        const b = fresh();
        editor.insertBlocks([cloneWithNewIds(b) as never], b.id, "after");
      },
    },
    {
      key: "insert-above",
      label: "Insert above",
      icon: CornerUpLeft,
      run: () => {
        const inserted = editor.insertBlocks(
          [{ type: "paragraph" } as never],
          block.id,
          "before",
        );
        if (inserted[0]) {
          editor.setTextCursorPosition(inserted[0].id, "start");
          editor.focus();
        }
      },
    },
    {
      key: "insert-below",
      label: "Insert below",
      icon: CornerDownLeft,
      run: () => {
        const inserted = editor.insertBlocks(
          [{ type: "paragraph" } as never],
          block.id,
          "after",
        );
        if (inserted[0]) {
          editor.setTextCursorPosition(inserted[0].id, "start");
          editor.focus();
        }
      },
    },
    {
      key: "move-up",
      label: "Move up",
      icon: ArrowUp,
      run: () => {
        const prev = editor.getPrevBlock(block.id);
        if (!prev) return;
        const b = fresh();
        editor.removeBlocks([b.id]);
        editor.insertBlocks([b as never], prev.id, "before");
      },
    },
    {
      key: "move-down",
      label: "Move down",
      icon: ArrowDown,
      run: () => {
        const next = editor.getNextBlock(block.id);
        if (!next) return;
        const b = fresh();
        editor.removeBlocks([b.id]);
        editor.insertBlocks([b as never], next.id, "after");
      },
    },
    {
      key: "move-to",
      label: "Move to page…",
      icon: ArrowUpRight,
      run: () => handlers.onMoveTo(block.id),
    },
    {
      key: "copy-text",
      label: "Copy text",
      icon: ClipboardCopy,
      run: () => copyToClipboard(extractText(fresh().content), "Text"),
    },
    {
      key: "copy-md",
      label: "Copy as Markdown",
      icon: ClipboardCopy,
      run: () =>
        copyToClipboard(blockNoteToMd(fresh() as BnBlock), "Markdown"),
    },
    {
      key: "copy-link",
      label: "Copy link to block",
      icon: Link2,
      run: () => {
        const url = `${location.origin}${location.pathname}?doc=${store.currentId}&block=${block.id}`;
        copyToClipboard(url, "Block link");
      },
    },
  ];

  // Type-specific extras.
  if (block.type === "math") {
    actions.push(
      {
        key: "edit-latex",
        label: "Edit LaTeX",
        icon: SquareSigma,
        run: () =>
          handlers.onEditMath(block.id, String(block.props.tex || "")),
      },
      {
        key: "copy-latex",
        label: "Copy LaTeX code",
        icon: ClipboardCopy,
        run: () =>
          copyToClipboard(String(fresh().props.tex || ""), "LaTeX code"),
      },
    );
  }
  if (block.type === "page" && block.props.pageId) {
    actions.push({
      key: "open-page",
      label: "Open page",
      icon: FileText,
      run: () => store.openDoc(String(block.props.pageId)),
    });
  }
  if (block.type === "linkfile" && block.props.path) {
    actions.push({
      key: "open-file",
      label: "Open file",
      icon: ExternalLink,
      run: async () => {
        const r = await store.client.openFile(String(block.props.path));
        if (!r?.ok) toast.error("Could not open the file");
      },
    });
  }

  actions.push({
    key: "delete",
    label: "Delete",
    icon: Trash2,
    destructive: true,
    run: () => editor.removeBlocks([block.id]),
  });

  const canTurn = TURNABLE.has(block.type);
  const q = query.trim().toLowerCase();

  // Search results: flat list across actions + turn-into targets.
  const matches: Array<Action> = q
    ? [
        ...actions.filter((a) => a.label.toLowerCase().includes(q)),
        ...(canTurn
          ? TURN_TARGETS.filter((t) =>
              `turn into ${t.label}`.toLowerCase().includes(q),
            ).map((t) => ({
              key: `turn-${t.label}`,
              label: `Turn into ${t.label}`,
              icon: t.icon,
              run: () => turnInto(t),
            }))
          : []),
      ]
    : [];

  const Item = ({ a }: { a: Action }) => (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      icon={<a.icon className="size-3.5" />}
      onClick={a.run}
    >
      {a.label}
    </Components.Generic.Menu.Item>
  );

  return (
    <>
      <div className="px-1 pt-1 pb-1.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actions…"
          className="h-7 text-xs"
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {q ? (
        matches.length ? (
          matches.map((a) => <Item key={a.key} a={a} />)
        ) : (
          <div className="text-muted-foreground px-3 py-2 text-xs">
            No action matches.
          </div>
        )
      ) : (
        <>
          {canTurn && (
            <Components.Generic.Menu.Root position="right" sub={true}>
              <Components.Generic.Menu.Trigger sub={true}>
                <Components.Generic.Menu.Item
                  className="bn-menu-item"
                  subTrigger={true}
                  icon={<Repeat2 className="size-3.5" />}
                >
                  Turn into
                </Components.Generic.Menu.Item>
              </Components.Generic.Menu.Trigger>
              <Components.Generic.Menu.Dropdown
                sub={true}
                className="bn-menu-dropdown"
              >
                {TURN_TARGETS.map((t) => (
                  <Components.Generic.Menu.Item
                    key={t.label}
                    className="bn-menu-item"
                    icon={<t.icon className="size-3.5" />}
                    onClick={() => turnInto(t)}
                  >
                    <span className="flex w-full items-center justify-between gap-3">
                      {t.label}
                      {isTurnTarget(block, t) && <Check className="size-3.5" />}
                    </span>
                  </Components.Generic.Menu.Item>
                ))}
              </Components.Generic.Menu.Dropdown>
            </Components.Generic.Menu.Root>
          )}
          <BlockColorsItem>
            <span className="flex items-center gap-2">
              <Type className="size-3.5" /> Color
            </span>
          </BlockColorsItem>
          {actions.map((a) => (
            <Item key={a.key} a={a} />
          ))}
        </>
      )}
    </>
  );
}
