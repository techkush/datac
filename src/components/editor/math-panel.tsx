"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cleanMathSource, guessFraction, renderMathHtml } from "@/lib/datac/math";

const SNIPPETS = [
  { label: "frac", ins: "\\frac{a}{b}" },
  { label: "matrix", ins: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}" },
  { label: "hat", ins: "\\hat{x}" },
  { label: "dot", ins: "\\dot{x}" },
  { label: "x_t", ins: "_{t}" },
  { label: "x^T", ins: "^{T}" },
  { label: "θ", ins: "\\theta" },
  { label: "Δ", ins: "\\Delta" },
];

export function MathPanel({
  open,
  mode,
  initialTex,
  onCommit,
  onClose,
}: {
  open: boolean;
  mode: "edit" | "insert";
  initialTex: string;
  onCommit: (tex: string) => void;
  onClose: () => void;
}) {
  const [source, setSource] = React.useState("");
  const [latex, setLatex] = React.useState(initialTex);
  const latexRef = React.useRef<HTMLTextAreaElement>(null);

  // Best-effort: only shown when a flattened fraction is confidently detected.
  const fracGuess = React.useMemo(() => guessFraction(latex), [latex]);

  React.useEffect(() => {
    if (open) {
      setSource("");
      setLatex(initialTex);
    }
  }, [open, initialTex]);

  const insertAtCaret = (text: string) => {
    const el = latexRef.current;
    if (!el) {
      setLatex((v) => v + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = latex.slice(0, start) + text + latex.slice(end);
    setLatex(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>∑ Math equation</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          <div className="grid gap-1.5">
            <Label htmlFor="mp-source">Paste your source</Label>
            <textarea
              id="mp-source"
              rows={3}
              value={source}
              spellCheck={false}
              onChange={(e) => setSource(e.target.value)}
              onPaste={(e) => {
                const t = e.clipboardData.getData("text/plain");
                setTimeout(() => {
                  const cleaned = cleanMathSource(t || source);
                  if (cleaned) setLatex(cleaned);
                }, 0);
              }}
              placeholder="Paste math from ChatGPT, a website or a PDF — it gets auto-cleaned into LaTeX below."
              className="bg-muted resize-none rounded-md p-2 font-mono text-sm outline-none"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLatex(cleanMathSource(source || latex))}
            >
              ↧ Auto-clean to LaTeX
            </Button>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mp-latex">
              LaTeX <span className="text-muted-foreground">— edit to correct</span>
            </Label>
            <div className="flex flex-wrap gap-1">
              {SNIPPETS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => insertAtCaret(s.ins)}
                  className="bg-muted hover:bg-accent rounded px-2 py-1 font-mono text-xs"
                >
                  {s.label}
                </button>
              ))}
            </div>
            <textarea
              id="mp-latex"
              ref={latexRef}
              rows={5}
              value={latex}
              spellCheck={false}
              onChange={(e) => setLatex(e.target.value)}
              placeholder={"\\hat{x}_{t} = F\\,\\hat{x}_{t-1}"}
              className="bg-muted resize-none rounded-md p-2 font-mono text-sm outline-none"
            />
            {fracGuess && fracGuess !== latex && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setLatex(fracGuess)}
              >
                ⁄ Looks like a fraction — convert
              </Button>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Preview</Label>
            <div
              className="bg-muted/50 min-h-16 overflow-x-auto rounded-md p-3"
              dangerouslySetInnerHTML={{ __html: renderMathHtml(latex) }}
            />
          </div>
        </div>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onCommit(latex.trim())}>
            {mode === "edit" ? "Update" : "Insert to page"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
