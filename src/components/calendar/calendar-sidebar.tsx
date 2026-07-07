"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  LogOut,
  Plus,
  Check,
  BarChart3,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { calendarApi } from "@/lib/calendar/api";
import { monthWeeks } from "@/lib/calendar/dates";
import { CALENDAR_COLORS } from "@/lib/calendar/constants";
import type { Category } from "@/lib/calendar/types";
import { useCalendar } from "./store";
import { ReportsDialog } from "./reports-dialog";

function CategoryEditDialog({
  category,
  onClose,
}: {
  category: Category | null;
  onClose: () => void;
}) {
  const { editCategory, removeCategory } = useCalendar();
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<string>(CALENDAR_COLORS[7]);

  React.useEffect(() => {
    if (category) {
      setName(category.name);
      setColor(category.color);
    }
  }, [category]);

  const save = async () => {
    if (!category || !name.trim()) return;
    await editCategory(category.id, { name: name.trim(), color });
    onClose();
  };

  return (
    <Dialog open={!!category} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit category</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <div className="flex flex-wrap gap-1.5">
          {CALENDAR_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="flex size-6 items-center justify-center rounded-full"
              style={{ background: c }}
              aria-label={c}
            >
              {color === c && <Check className="size-3.5 text-white" />}
            </button>
          ))}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              if (category) await removeCategory(category.id);
              onClose();
            }}
          >
            <Trash2 className="size-4" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniMonth() {
  const { cursor, setCursor, setView, weekStartsOn } = useCalendar();
  const [month, setMonth] = React.useState<Date>(() => startOfMonth(cursor));

  React.useEffect(() => setMonth(startOfMonth(cursor)), [cursor]);

  const weeks = monthWeeks(month, weekStartsOn);
  const dow = weekStartsOn === 1
    ? ["M", "T", "W", "T", "F", "S", "S"]
    : ["S", "M", "T", "W", "T", "F", "S"];
  const today = new Date();

  return (
    <div className="px-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">{format(month, "MMMM yyyy")}</span>
        <div className="flex">
          <button
            className="hover:bg-accent text-muted-foreground rounded p-1"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            className="hover:bg-accent text-muted-foreground rounded p-1"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {dow.map((d, i) => (
          <span key={i} className="text-muted-foreground py-1 text-[10px]">
            {d}
          </span>
        ))}
        {weeks.flat().map((day) => {
          const selected = isSameDay(day, cursor);
          const isToday = isSameDay(day, today);
          const outside = !isSameMonth(day, month);
          return (
            <button
              key={day.toISOString()}
              onClick={() => {
                setCursor(day);
                setView("day");
              }}
              data-selected={selected}
              className="hover:bg-accent data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground relative mx-auto flex size-6 items-center justify-center rounded-full text-[11px]"
              style={outside ? { opacity: 0.4 } : undefined}
            >
              <span className={isToday && !selected ? "text-primary font-semibold" : ""}>
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddCategory() {
  const { addCategory } = useCalendar();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<string>(CALENDAR_COLORS[4]);

  const submit = async () => {
    if (!name.trim()) return;
    await addCategory(name.trim(), color);
    setName("");
    setColor(CALENDAR_COLORS[4]);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
          <Plus className="size-3.5" /> Add
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 space-y-2">
        <Input
          autoFocus
          placeholder="Category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <div className="flex flex-wrap gap-1.5">
          {CALENDAR_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="flex size-6 items-center justify-center rounded-full"
              style={{ background: c }}
              aria-label={c}
            >
              {color === c && <Check className="size-3.5 text-white" />}
            </button>
          ))}
        </div>
        <Button size="sm" className="w-full" onClick={submit}>
          Add category
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function CalendarSidebar() {
  const { user, categories, hiddenCategories, toggleCategory, removeCategory, openNew } =
    useCalendar();
  const [reportsOpen, setReportsOpen] = React.useState(false);
  const [editCat, setEditCat] = React.useState<Category | null>(null);

  return (
    <aside className="bg-sidebar flex w-64 shrink-0 flex-col border-r">
      <div className="flex h-14 items-center gap-2 border-b px-3">
        <span className="text-primary text-base leading-none">◆</span>
        <span className="text-sm font-semibold">Calendar</span>
        <Button asChild variant="ghost" size="icon" className="ml-auto size-7">
          <Link href="/" aria-label="Home">
            <Home className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="p-3">
        <Button className="w-full justify-start" onClick={() => openNew()}>
          <Plus className="size-4" /> New event
        </Button>
      </div>

      <div className="border-b pb-3">
        <MiniMonth />
      </div>

      <div className="border-b px-3 py-2">
        <button
          onClick={() => setReportsOpen(true)}
          className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
        >
          <BarChart3 className="text-muted-foreground size-4" /> Reports
        </button>
      </div>
      <ReportsDialog open={reportsOpen} onOpenChange={setReportsOpen} />

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
            Categories
          </span>
          <AddCategory />
        </div>
        <ul className="space-y-0.5">
          {categories.length === 0 && (
            <li className="text-muted-foreground text-xs">No categories yet</li>
          )}
          {categories.map((c) => {
            const hidden = hiddenCategories.has(c.id);
            return (
              <li key={c.id} className="group/cat flex items-center">
                <button
                  onClick={() => toggleCategory(c.id)}
                  onDoubleClick={() => setEditCat(c)}
                  title="Click to show/hide · double-click to edit"
                  className="hover:bg-accent flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  <span
                    className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border"
                    style={{
                      background: hidden ? "transparent" : c.color,
                      borderColor: c.color,
                    }}
                  >
                    {!hidden && <Check className="size-3 text-white" />}
                  </span>
                  <span
                    className="truncate"
                    style={hidden ? { opacity: 0.5 } : undefined}
                  >
                    {c.name}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded opacity-0 group-hover/cat:opacity-100 data-[state=open]:opacity-100"
                      aria-label="Category options"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditCat(c)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => removeCategory(c.id)}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      </div>

      <CategoryEditDialog category={editCat} onClose={() => setEditCat(null)} />

      <div className="flex items-center gap-2 border-t px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">
            {user.name || user.email}
          </div>
          <div className="text-muted-foreground truncate text-[11px]">
            {user.email}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Log out"
          onClick={async () => {
            await calendarApi.logout();
            window.location.href = "/calendar";
          }}
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </aside>
  );
}
