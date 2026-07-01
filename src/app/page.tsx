import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-primary text-xl leading-none">◆</span>
          <span className="text-lg font-semibold tracking-tight">datac</span>
          <Badge variant="secondary">Next.js</Badge>
        </div>
        <ThemeToggle />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Phase 1 — scaffold &amp; theme</CardTitle>
          <CardDescription>
            Next.js (App Router) + Tailwind v4 + shadcn/ui, wired to the datac
            theme. Toggle the button above to verify light/dark.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-sm">
        The workspaces launcher and editor arrive in later phases.
      </p>
    </main>
  );
}
