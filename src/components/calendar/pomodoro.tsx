"use client";

import * as React from "react";
import {
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Settings2,
  X,
  Coffee,
  Brain,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { calendarApi } from "@/lib/calendar/api";
import type { CalendarSettings } from "@/lib/calendar/types";

type Phase = "idle" | "focus" | "break" | "longBreak";

interface LinkedEvent {
  id: string;
  title: string;
}

interface PomodoroCtx {
  open: boolean;
  phase: Phase;
  running: boolean;
  secondsLeft: number;
  cyclesCompleted: number;
  linked: LinkedEvent | null;
  settings: CalendarSettings;
  openWidget: () => void;
  closeWidget: () => void;
  start: (event?: LinkedEvent) => Promise<void>;
  toggleRun: () => void;
  reset: () => Promise<void>;
  skip: () => void;
  updateDurations: (patch: Partial<CalendarSettings>) => Promise<void>;
}

const Ctx = React.createContext<PomodoroCtx | null>(null);
export function usePomodoro(): PomodoroCtx {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("usePomodoro must be used within PomodoroProvider");
  return v;
}

function beep() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.start();
    setTimeout(() => {
      o.stop();
      ac.close();
    }, 220);
  } catch {
    /* audio not available */
  }
}

function notify(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    /* notifications not available */
  }
}

export function PomodoroProvider({
  initialSettings,
  children,
}: {
  initialSettings: CalendarSettings;
  children: React.ReactNode;
}) {
  const [settings, setSettings] = React.useState(initialSettings);
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [running, setRunning] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(
    initialSettings.pomodoroWorkMinutes * 60,
  );
  const [cyclesCompleted, setCyclesCompleted] = React.useState(0);
  const [linked, setLinked] = React.useState<LinkedEvent | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);

  // Latest-value refs for the interval/transition logic.
  const phaseRef = React.useRef(phase);
  const cyclesRef = React.useRef(cyclesCompleted);
  const settingsRef = React.useRef(settings);
  const sessionRef = React.useRef(sessionId);
  const focusRef = React.useRef(0); // accrued focus seconds this session
  React.useEffect(() => void (phaseRef.current = phase), [phase]);
  React.useEffect(() => void (cyclesRef.current = cyclesCompleted), [cyclesCompleted]);
  React.useEffect(() => void (settingsRef.current = settings), [settings]);
  React.useEffect(() => void (sessionRef.current = sessionId), [sessionId]);

  const patchSession = React.useCallback(
    (input: { cyclesCompleted?: number; focusSeconds?: number; ended?: boolean }) => {
      const id = sessionRef.current;
      if (!id) return;
      calendarApi.updatePomodoro(id, input).catch(() => {});
    },
    [],
  );

  const advancePhase = React.useCallback(() => {
    const s = settingsRef.current;
    if (phaseRef.current === "focus") {
      const newCycles = cyclesRef.current + 1;
      setCyclesCompleted(newCycles);
      patchSession({ cyclesCompleted: newCycles, focusSeconds: focusRef.current });
      const long = newCycles % s.pomodoroCyclesBeforeLongBreak === 0;
      setPhase(long ? "longBreak" : "break");
      setSecondsLeft(
        (long ? s.pomodoroLongBreakMinutes : s.pomodoroBreakMinutes) * 60,
      );
      notify("Break time", `Nice work — take ${long ? s.pomodoroLongBreakMinutes : s.pomodoroBreakMinutes} min.`);
      beep();
    } else {
      setPhase("focus");
      setSecondsLeft(s.pomodoroWorkMinutes * 60);
      notify("Focus time", "Back to it.");
      beep();
    }
  }, [patchSession]);

  // 1-second ticker.
  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      if (phaseRef.current === "focus") focusRef.current += 1;
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  // Phase boundary.
  React.useEffect(() => {
    if (running && secondsLeft === 0) advancePhase();
  }, [secondsLeft, running, advancePhase]);

  const start = React.useCallback(
    async (event?: LinkedEvent) => {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }
      } catch {}
      // Finalize any prior session.
      if (sessionRef.current) {
        patchSession({ focusSeconds: focusRef.current, ended: true });
      }
      const s = settingsRef.current;
      setLinked(event ?? null);
      setOpen(true);
      focusRef.current = 0;
      setCyclesCompleted(0);
      setPhase("focus");
      setSecondsLeft(s.pomodoroWorkMinutes * 60);
      setRunning(true);
      try {
        const session = await calendarApi.startPomodoro({
          eventId: event?.id ?? null,
          workMinutes: s.pomodoroWorkMinutes,
          breakMinutes: s.pomodoroBreakMinutes,
          cyclesPlanned: s.pomodoroCyclesBeforeLongBreak,
        });
        setSessionId(session.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not start session");
      }
    },
    [patchSession],
  );

  const toggleRun = React.useCallback(() => {
    if (phaseRef.current === "idle") {
      void start(linked ?? undefined);
      return;
    }
    setRunning((r) => !r);
  }, [start, linked]);

  const reset = React.useCallback(async () => {
    setRunning(false);
    if (sessionRef.current) {
      patchSession({
        cyclesCompleted: cyclesRef.current,
        focusSeconds: focusRef.current,
        ended: true,
      });
    }
    if (linked && focusRef.current > 60) {
      toast.success(
        `Logged ${Math.round(focusRef.current / 60)} min of focus to "${linked.title}"`,
      );
    }
    setSessionId(null);
    setLinked(null);
    focusRef.current = 0;
    setCyclesCompleted(0);
    setPhase("idle");
    setSecondsLeft(settingsRef.current.pomodoroWorkMinutes * 60);
  }, [patchSession, linked]);

  const skip = React.useCallback(() => {
    const s = settingsRef.current;
    if (phaseRef.current === "focus") {
      setPhase("break");
      setSecondsLeft(s.pomodoroBreakMinutes * 60);
    } else {
      setPhase("focus");
      setSecondsLeft(s.pomodoroWorkMinutes * 60);
    }
  }, []);

  const updateDurations = React.useCallback(
    async (patch: Partial<CalendarSettings>) => {
      const next = { ...settingsRef.current, ...patch };
      setSettings(next);
      if (phaseRef.current === "idle") {
        setSecondsLeft(next.pomodoroWorkMinutes * 60);
      }
      try {
        await calendarApi.updateSettings(patch);
      } catch {
        toast.error("Could not save Pomodoro settings");
      }
    },
    [],
  );

  const value: PomodoroCtx = {
    open,
    phase,
    running,
    secondsLeft,
    cyclesCompleted,
    linked,
    settings,
    openWidget: () => setOpen(true),
    closeWidget: () => setOpen(false),
    start,
    toggleRun,
    reset,
    skip,
    updateDurations,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <PomodoroWidget />
    </Ctx.Provider>
  );
}

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const PHASE_META: Record<Phase, { label: string; color: string; icon: React.ReactNode }> = {
  idle: { label: "Ready", color: "#6b7280", icon: <Brain className="size-4" /> },
  focus: { label: "Focus", color: "#ef4444", icon: <Brain className="size-4" /> },
  break: { label: "Break", color: "#22c55e", icon: <Coffee className="size-4" /> },
  longBreak: { label: "Long break", color: "#14b8a6", icon: <Coffee className="size-4" /> },
};

function PomodoroWidget() {
  const {
    open,
    phase,
    running,
    secondsLeft,
    cyclesCompleted,
    linked,
    settings,
    closeWidget,
    start,
    toggleRun,
    reset,
    skip,
    updateDurations,
  } = usePomodoro();

  if (!open) return null;
  const meta = PHASE_META[phase];
  const totalForPhase =
    (phase === "break"
      ? settings.pomodoroBreakMinutes
      : phase === "longBreak"
        ? settings.pomodoroLongBreakMinutes
        : settings.pomodoroWorkMinutes) * 60;
  const pct = totalForPhase > 0 ? 1 - secondsLeft / totalForPhase : 0;
  const dots = settings.pomodoroCyclesBeforeLongBreak;

  return (
    <div className="bg-card fixed bottom-4 right-4 z-50 w-72 rounded-xl border shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: meta.color }}>
          {meta.icon} {meta.label}
        </div>
        <div className="flex items-center gap-0.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Pomodoro settings">
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 space-y-2">
              <p className="text-sm font-medium">Durations (minutes)</p>
              <DurationRow
                label="Focus"
                value={settings.pomodoroWorkMinutes}
                onChange={(v) => updateDurations({ pomodoroWorkMinutes: v })}
              />
              <DurationRow
                label="Short break"
                value={settings.pomodoroBreakMinutes}
                onChange={(v) => updateDurations({ pomodoroBreakMinutes: v })}
              />
              <DurationRow
                label="Long break"
                value={settings.pomodoroLongBreakMinutes}
                onChange={(v) => updateDurations({ pomodoroLongBreakMinutes: v })}
              />
              <DurationRow
                label="Cycles → long break"
                value={settings.pomodoroCyclesBeforeLongBreak}
                onChange={(v) =>
                  updateDurations({ pomodoroCyclesBeforeLongBreak: v })
                }
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="size-7" onClick={closeWidget} aria-label="Minimize">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 p-4">
        {linked && (
          <div className="text-muted-foreground max-w-full truncate text-xs">
            Working on: <span className="text-foreground font-medium">{linked.title}</span>
          </div>
        )}

        {/* Radial progress */}
        <div className="relative flex size-40 items-center justify-center">
          <svg className="size-40 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted opacity-30" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={meta.color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 45}
              strokeDashoffset={2 * Math.PI * 45 * (1 - pct)}
            />
          </svg>
          <div className="absolute text-center">
            <div className="text-3xl font-semibold tabular-nums">{fmt(secondsLeft)}</div>
            <div className="text-muted-foreground text-[11px]">
              cycle {cyclesCompleted}
            </div>
          </div>
        </div>

        {/* Cycle dots */}
        <div className="flex gap-1">
          {Array.from({ length: dots }).map((_, i) => (
            <span
              key={i}
              className="size-2 rounded-full"
              style={{
                background:
                  i < cyclesCompleted % dots || (cyclesCompleted > 0 && cyclesCompleted % dots === 0)
                    ? meta.color
                    : "var(--muted)",
                opacity: i < cyclesCompleted % dots ? 1 : 0.3,
              }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={reset} aria-label="Reset">
            <RotateCcw className="size-4" />
          </Button>
          <Button size="lg" className="px-6" onClick={toggleRun}>
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
            {phase === "idle" ? "Start" : running ? "Pause" : "Resume"}
          </Button>
          <Button size="icon" variant="outline" onClick={skip} aria-label="Skip phase">
            <SkipForward className="size-4" />
          </Button>
        </div>

        {phase === "idle" && (
          <button
            onClick={() => start()}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Start a free focus session
          </button>
        )}
      </div>
    </div>
  );
}

function DurationRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= 1) onChange(v);
        }}
        className="h-8 w-20"
      />
    </div>
  );
}
