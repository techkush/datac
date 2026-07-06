"use client";

import * as React from "react";
import { CalendarProvider, useCalendar } from "./store";
import { CalendarSidebar } from "./calendar-sidebar";
import { CalendarToolbar } from "./toolbar";
import { MonthView } from "./views/month-view";
import { TimeGridView } from "./views/time-grid-view";
import { AgendaView } from "./views/agenda-view";
import { EventDialog } from "./event-dialog";
import { PomodoroProvider } from "./pomodoro";
import type { CalendarUser } from "./store";
import type { Category, CalendarSettings } from "@/lib/calendar/types";

function ViewSwitch() {
  const { view } = useCalendar();
  if (view === "month") return <MonthView />;
  if (view === "agenda") return <AgendaView />;
  return <TimeGridView days={view === "day" ? 1 : 7} />;
}

export function CalendarApp({
  user,
  weekStartsOn,
  categories,
  settings,
}: {
  user: CalendarUser;
  weekStartsOn: 0 | 1;
  categories: Category[];
  settings: CalendarSettings;
}) {
  return (
    <CalendarProvider
      user={user}
      weekStartsOn={weekStartsOn}
      initialCategories={categories}
    >
      <PomodoroProvider initialSettings={settings}>
        <div className="flex h-svh min-w-0 overflow-hidden">
          <CalendarSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <CalendarToolbar />
            <div className="min-h-0 flex-1 overflow-hidden">
              <ViewSwitch />
            </div>
          </div>
        </div>
        <EventDialog />
      </PomodoroProvider>
    </CalendarProvider>
  );
}
