"use client";

import * as React from "react";
import { ListTodo, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const APPS = [
  { key: "todo", label: "Microsoft To Do", icon: ListTodo },
  { key: "outlook", label: "Outlook", icon: Mail },
] as const;

// Launch the desktop app; if it isn't installed, open the web version.
export function OpenApps() {
  async function open(app: (typeof APPS)[number]) {
    try {
      const r = await fetch("/api/apps/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: app.key }),
      });
      const d = (await r.json()) as { ok?: boolean; web?: string };
      if (!d.ok && d.web) window.open(d.web, "_blank", "noopener");
      else if (!d.ok) throw new Error();
    } catch {
      toast.error(`Could not open ${app.label}`);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Open apps
      </h2>
      <div className="flex flex-col gap-1.5">
        {APPS.map((app) => (
          <Button
            key={app.key}
            variant="outline"
            className="justify-start"
            onClick={() => open(app)}
          >
            <app.icon className="size-4" /> {app.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
