"use client";

import * as React from "react";
import { format } from "date-fns";
import { Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REMINDER_PRESETS, STATUS_DEFS } from "@/lib/calendar/constants";
import type { EventStatus } from "@/lib/calendar/constants";
import {
  RECURRENCE_OPTIONS,
  buildRRule,
  detectPreset,
  detectUntil,
  type RecurrencePreset,
} from "@/lib/calendar/recurrence-ui";
import { useCalendar } from "./store";
import { usePomodoro } from "./pomodoro";
import type { EventInput } from "@/lib/calendar/types";

const NO_CATEGORY = "__none__";
const NO_REMINDER = "none";

function toLocalDateTime(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}
function toLocalDate(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}

export function EventDialog() {
  const { dialog, closeDialog, categories, saveEvent, deleteEvent } =
    useCalendar();
  const pomodoro = usePomodoro();
  const editing = dialog.event;

  const [title, setTitle] = React.useState("");
  const [allDay, setAllDay] = React.useState(false);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string>(NO_CATEGORY);
  const [location, setLocation] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<EventStatus>("NOT_STARTED");
  const [isTimeBlock, setIsTimeBlock] = React.useState(false);
  const [reminder, setReminder] = React.useState<number | null>(15);
  const [recurrence, setRecurrence] = React.useState<RecurrencePreset>("none");
  const [until, setUntil] = React.useState("");
  const [editScope, setEditScope] = React.useState<"occurrence" | "all">(
    "occurrence",
  );
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // An event is part of a series if it carries a rule or points at a master.
  const isRecurring = !!(editing?.recurrenceRule || editing?.recurrenceParentId);

  // Reset form whenever the sheet opens.
  React.useEffect(() => {
    if (!dialog.open) return;
    const now = new Date();
    const defStart = dialog.draftStart || now.toISOString();
    const defEnd =
      dialog.draftEnd || new Date(now.getTime() + 60 * 60_000).toISOString();
    if (editing) {
      setTitle(editing.title);
      setAllDay(editing.allDay);
      setStart(
        editing.allDay
          ? toLocalDate(editing.startsAt)
          : toLocalDateTime(editing.startsAt),
      );
      setEnd(
        editing.allDay
          ? toLocalDate(editing.endsAt)
          : toLocalDateTime(editing.endsAt),
      );
      setCategoryId(editing.categoryId || NO_CATEGORY);
      setLocation(editing.location || "");
      setDescription(editing.description || "");
      setStatus(editing.status);
      setIsTimeBlock(editing.isTimeBlock);
      setReminder(editing.reminders[0]?.minutesBefore ?? null);
      setRecurrence(detectPreset(editing.recurrenceRule));
      setUntil(detectUntil(editing.recurrenceRule));
      setEditScope("occurrence");
    } else {
      const ad = dialog.draftAllDay || false;
      setTitle("");
      setAllDay(ad);
      setStart(ad ? toLocalDate(defStart) : toLocalDateTime(defStart));
      setEnd(ad ? toLocalDate(defEnd) : toLocalDateTime(defEnd));
      setCategoryId(NO_CATEGORY);
      setLocation("");
      setDescription("");
      setStatus("NOT_STARTED");
      setIsTimeBlock(false);
      setReminder(15);
      setRecurrence("none");
      setUntil("");
      setEditScope("occurrence");
    }
    setConfirmDelete(false);
  }, [dialog.open, dialog.event, dialog.draftStart, dialog.draftEnd, dialog.draftAllDay, editing]);

  // Reformat the date/time fields when switching all-day on/off so the value
  // always matches its input type (date vs datetime-local) and stays valid.
  const toggleAllDay = (v: boolean) => {
    setAllDay(v);
    if (v) {
      setStart((s) => s.slice(0, 10));
      setEnd((e) => (e || start).slice(0, 10));
    } else {
      setStart((s) => (s.length <= 10 ? `${s.slice(0, 10)}T09:00` : s));
      setEnd((e) => (e.length <= 10 ? `${e.slice(0, 10)}T10:00` : e));
    }
  };

  const buildInput = (): EventInput | null => {
    if (!title.trim()) return null;
    const datePart = (s: string) => s.slice(0, 10);
    let startDate: Date;
    let endDate: Date;
    if (allDay) {
      startDate = new Date(`${datePart(start)}T00:00`);
      endDate = new Date(`${datePart(end || start)}T23:59`);
    } else {
      startDate = new Date(start);
      endDate = new Date(end);
    }
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      toast.error("Please set a valid start and end time");
      return null;
    }
    return {
      title: title.trim(),
      startsAt: startDate.toISOString(),
      endsAt: endDate.toISOString(),
      allDay,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      categoryId: categoryId === NO_CATEGORY ? null : categoryId,
      color: null, // block color follows the category
      location: location.trim() || null,
      description: description.trim() || null,
      status,
      isTimeBlock,
      recurrenceRule: buildRRule(recurrence, until),
      reminders: reminder === null ? [] : [{ minutesBefore: reminder }],
    };
  };

  const onSave = async () => {
    const input = buildInput();
    if (!input) return;
    setSaving(true);
    try {
      await saveEvent(input, editing?.id, isRecurring ? editScope : undefined);
    } catch {
      /* toast shown in store */
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!editing) return;
    if (isRecurring) setConfirmDelete(true);
    else deleteEvent(editing.id);
  };

  return (
    <>
      <Sheet open={dialog.open} onOpenChange={(o) => !o && closeDialog()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b">
            <SheetTitle>{editing ? "Edit event" : "New event"}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <Input
              autoFocus
              placeholder="Add title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base"
            />

            <div className="flex items-center justify-between">
              <Label htmlFor="allday" className="text-sm">
                All day
              </Label>
              <Switch id="allday" checked={allDay} onCheckedChange={toggleAllDay} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-muted-foreground text-xs">Starts</Label>
                <Input
                  type={allDay ? "date" : "datetime-local"}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Ends</Label>
                <Input
                  type={allDay ? "date" : "datetime-local"}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground text-xs">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span
                        className="mr-2 inline-block size-2.5 rounded-full align-middle"
                        style={{ background: c.color }}
                      />
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editing && (
              <div>
                <Label className="text-muted-foreground text-xs">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as EventStatus)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_DEFS.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        <span
                          className="mr-2 inline-block size-2.5 rounded-full align-middle"
                          style={{ background: s.color }}
                        />
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-muted-foreground text-xs">Repeat</Label>
              <div className="mt-1 flex items-center gap-2">
                <Select
                  value={recurrence}
                  onValueChange={(v) => setRecurrence(v as RecurrencePreset)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {recurrence !== "none" && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">until</span>
                    <Input
                      type="date"
                      value={until}
                      onChange={(e) => setUntil(e.target.value)}
                      className="h-9 w-36"
                    />
                  </div>
                )}
              </div>
            </div>

            {isRecurring && (
              <div className="bg-muted/50 rounded-md p-2.5">
                <Label className="text-muted-foreground text-xs">
                  Apply changes to
                </Label>
                <div className="mt-1 flex gap-1.5">
                  {(
                    [
                      { v: "occurrence", label: "This event" },
                      { v: "all", label: "All events" },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setEditScope(o.v)}
                      data-active={editScope === o.v}
                      className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary flex-1 rounded-md border px-2 py-1.5 text-xs font-medium"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="text-muted-foreground text-xs">Reminder</Label>
              <Select
                value={reminder === null ? NO_REMINDER : String(reminder)}
                onValueChange={(v) =>
                  setReminder(v === NO_REMINDER ? null : Number(v))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_REMINDER}>No reminder</SelectItem>
                  {REMINDER_PRESETS.map((p) => (
                    <SelectItem key={p.minutes} value={String(p.minutes)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />

            <Textarea
              placeholder="Description / notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />

            <div className="flex items-center justify-between rounded-md border p-2.5">
              <div>
                <Label htmlFor="timeblock" className="text-sm">
                  Time block
                </Label>
                <p className="text-muted-foreground text-xs">
                  Reserve this period for focused work.
                </p>
              </div>
              <Switch
                id="timeblock"
                checked={isTimeBlock}
                onCheckedChange={setIsTimeBlock}
              />
            </div>

            {editing && (
              <div className="flex items-center justify-between rounded-md border p-2.5">
                <div>
                  <p className="text-sm font-medium">Focus timer</p>
                  <p className="text-muted-foreground text-xs">
                    {editing.actualSeconds > 0
                      ? `${Math.round(editing.actualSeconds / 60)} min of focus logged`
                      : "Run a Pomodoro against this event."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    pomodoro.start({ id: editing.id, title: editing.title });
                    closeDialog();
                  }}
                >
                  <Play className="size-4" /> Start focus
                </Button>
              </div>
            )}
          </div>

          <SheetFooter className="flex-row items-center justify-between border-t">
            {editing ? (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={onDelete}
                aria-label="Delete event"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={saving || !title.trim()}>
                {saving ? "Saving…" : editing ? "Save" : "Create"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recurring event</AlertDialogTitle>
            <AlertDialogDescription>
              This event repeats. Choose what to delete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-between">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <div className="flex gap-2">
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => editing && deleteEvent(editing.id, "occurrence")}
              >
                This event
              </AlertDialogAction>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => editing && deleteEvent(editing.id, "all")}
              >
                All events
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
