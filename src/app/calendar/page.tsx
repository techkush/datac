import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { verifyToken } from "@/lib/calendar/auth";
import { AUTH_COOKIE } from "@/lib/calendar/http";
import { CalendarApp } from "@/components/calendar/calendar-app";
import { LoginScreen } from "@/components/calendar/login-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "DataC | Calendar" };

export default async function CalendarPage() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const auth = token ? verifyToken(token) : null;

  if (!auth) return <LoginScreen />;

  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    include: { settings: true, categories: { orderBy: { name: "asc" } } },
  });

  if (!user) return <LoginScreen />;

  const s = user.settings;
  const weekStartsOn = (s?.weekStartsOn === 1 ? 1 : 0) as 0 | 1;

  return (
    <CalendarApp
      user={{ id: user.id, email: user.email, name: user.name }}
      weekStartsOn={weekStartsOn}
      categories={user.categories.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        icon: c.icon,
      }))}
      settings={{
        timezone: s?.timezone ?? "UTC",
        weekStartsOn: s?.weekStartsOn ?? 0,
        pomodoroWorkMinutes: s?.pomodoroWorkMinutes ?? 25,
        pomodoroBreakMinutes: s?.pomodoroBreakMinutes ?? 5,
        pomodoroLongBreakMinutes: s?.pomodoroLongBreakMinutes ?? 15,
        pomodoroCyclesBeforeLongBreak: s?.pomodoroCyclesBeforeLongBreak ?? 4,
        defaultReminderMinutes: s?.defaultReminderMinutes ?? null,
      }}
    />
  );
}
