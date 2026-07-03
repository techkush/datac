"use client";

// Advanced LaTeX block editor: symbol/template toolbar, image → LaTeX OCR
// (pix2tex, fully local), unicode auto-clean, live KaTeX preview.

import * as React from "react";
import { ImageUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  renderMathHtml,
  renderMathInlineHtml,
  cleanMathSource,
} from "@/lib/datac/math";
import { readAsDataURL } from "@/lib/datac/upload";

/* ---- symbol / template palette ------------------------------------------ */

interface Sym {
  tex: string; // rendered on the button
  insert: string; // inserted at the cursor
  label?: string; // tooltip / fallback
}

const sym = (insert: string, tex?: string, label?: string): Sym => ({
  insert,
  tex: tex ?? insert,
  label,
});

const PALETTE: Array<{ key: string; title: string; items: Sym[] }> = [
  {
    key: "basic",
    title: "Basic",
    items: [
      sym("\\frac{a}{b}", "\\frac{a}{b}", "Fraction"),
      sym("\\sqrt{x}", "\\sqrt{x}", "Square root"),
      sym("\\sqrt[n]{x}", "\\sqrt[n]{x}", "n-th root"),
      sym("x^{2}", "x^{2}", "Superscript"),
      sym("x_{i}", "x_{i}", "Subscript"),
      sym("\\sum_{i=1}^{n}", "\\sum_{i=1}^{n}", "Sum"),
      sym("\\prod_{i=1}^{n}", "\\prod_{i=1}^{n}", "Product"),
      sym("\\int_{a}^{b}", "\\int_{a}^{b}", "Integral"),
      sym("\\oint", "\\oint", "Contour integral"),
      sym("\\lim_{x \\to 0}", "\\lim_{x\\to 0}", "Limit"),
      sym("\\binom{n}{k}", "\\binom{n}{k}", "Binomial"),
      sym("\\infty"),
      sym("\\pm"),
      sym("\\mp"),
      sym("\\times"),
      sym("\\div"),
      sym("\\cdot"),
      sym("\\neq"),
      sym("\\leq"),
      sym("\\geq"),
      sym("\\approx"),
      sym("\\equiv"),
      sym("\\propto"),
      sym("\\sim"),
    ],
  },
  {
    key: "greek",
    title: "Greek",
    items: [
      "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
      "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho", "sigma",
      "tau", "upsilon", "phi", "chi", "psi", "omega",
    ]
      .map((g) => sym(`\\${g}`))
      .concat(
        ["Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Phi", "Psi", "Omega"].map(
          (g) => sym(`\\${g}`),
        ),
      ),
  },
  {
    key: "sets",
    title: "Sets & logic",
    items: [
      sym("\\in"),
      sym("\\notin"),
      sym("\\subset"),
      sym("\\subseteq"),
      sym("\\supset"),
      sym("\\supseteq"),
      sym("\\cup"),
      sym("\\cap"),
      sym("\\setminus"),
      sym("\\emptyset"),
      sym("\\forall"),
      sym("\\exists"),
      sym("\\nexists"),
      sym("\\neg"),
      sym("\\land"),
      sym("\\lor"),
      sym("\\implies"),
      sym("\\iff"),
      sym("\\mathbb{R}"),
      sym("\\mathbb{N}"),
      sym("\\mathbb{Z}"),
      sym("\\mathbb{Q}"),
      sym("\\mathbb{C}"),
      sym("\\partial"),
      sym("\\nabla"),
      sym("\\angle"),
      sym("\\perp"),
      sym("\\parallel"),
    ],
  },
  {
    key: "arrows",
    title: "Arrows",
    items: [
      sym("\\to"),
      sym("\\gets"),
      sym("\\leftrightarrow"),
      sym("\\Rightarrow"),
      sym("\\Leftarrow"),
      sym("\\Leftrightarrow"),
      sym("\\mapsto"),
      sym("\\uparrow"),
      sym("\\downarrow"),
      sym("\\rightharpoonup"),
      sym("\\rightleftharpoons"),
      sym("\\hookrightarrow"),
      sym("\\longrightarrow"),
      sym("\\Longrightarrow"),
    ],
  },
  {
    key: "blocks",
    title: "Matrices & blocks",
    items: [
      sym(
        "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
        "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
        "Matrix ( )",
      ),
      sym(
        "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}",
        "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}",
        "Matrix [ ]",
      ),
      sym(
        "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}",
        "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}",
        "Determinant",
      ),
      sym(
        "\\begin{cases} x & \\text{if } a \\\\ y & \\text{else} \\end{cases}",
        "\\begin{cases} x & a \\\\ y & b \\end{cases}",
        "Cases",
      ),
      sym(
        "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}",
        "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}",
        "Aligned",
      ),
      sym("\\vec{v}", "\\vec{v}", "Vector"),
      sym("\\hat{x}", "\\hat{x}", "Hat"),
      sym("\\bar{x}", "\\bar{x}", "Bar"),
      sym("\\dot{x}", "\\dot{x}", "Dot"),
      sym("\\tilde{x}", "\\tilde{x}", "Tilde"),
      sym("\\overline{AB}", "\\overline{AB}", "Overline"),
      sym("\\underbrace{x+y}_{z}", "\\underbrace{x+y}_{z}", "Underbrace"),
      sym("\\overbrace{x+y}^{z}", "\\overbrace{x+y}^{z}", "Overbrace"),
      sym("\\left( x \\right)", "\\left(x\\right)", "Auto ( )"),
      sym("\\left[ x \\right]", "\\left[x\\right]", "Auto [ ]"),
      sym("\\left\\{ x \\right\\}", "\\left\\{x\\right\\}", "Auto { }"),
      sym("\\left| x \\right|", "\\left|x\\right|", "Abs"),
      sym("\\text{text}", "\\text{text}", "Text"),
    ],
  },
];

function SymbolButton({
  item,
  small,
  onInsert,
}: {
  item: Sym;
  small?: boolean;
  onInsert: (s: string) => void;
}) {
  const html = React.useMemo(
    () => renderMathInlineHtml(item.tex),
    [item.tex],
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={
            small
              ? "hover:bg-accent flex h-auto min-h-9 min-w-9 items-center justify-center rounded-md border px-2.5 py-1.5 text-[10px] leading-none [&_.katex]:leading-tight"
              : "hover:bg-accent flex h-9 min-w-9 items-center justify-center rounded-md border px-1.5 text-sm"
          }
          onClick={() => onInsert(item.insert)}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-mono text-xs">{item.label || item.insert}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/* ---- the dialog ----------------------------------------------------------- */

export function LatexDialog({
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
  // Fresh state per target via the `key` prop on this dialog.
  const [tex, setTex] = React.useState(initialTex);
  const [ocrBusy, setOcrBusy] = React.useState(false);
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const html = React.useMemo(() => renderMathHtml(tex), [tex]);
  const canCommit = !!tex.trim() && !ocrBusy;

  function commit() {
    if (!canCommit) return;
    onCommit(tex.trim());
  }

  // Insert a snippet at the caret and restore focus.
  const insertAtCursor = React.useCallback((snippet: string) => {
    const el = areaRef.current;
    if (!el) {
      setTex((t) => t + snippet);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const pad = before && !/[\s{(^_]$/.test(before) ? " " : "";
    const next = before + pad + snippet + after;
    setTex(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = (before + pad + snippet).length;
      el.setSelectionRange(pos, pos);
    });
  }, []);

  // Image → LaTeX via the local pix2tex backend.
  const runOcr = React.useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setOcrBusy(true);
      toast.loading("Reading formula from image…", { id: "latex-ocr" });
      try {
        const dataUrl = await readAsDataURL(file);
        const r = await fetch("/api/latex-ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const d = (await r.json()) as {
          latex?: string;
          error?: string;
          install?: string;
        };
        if (!r.ok || !d.latex) {
          toast.error(
            d.install
              ? "pix2tex is not installed — run: " + d.install
              : d.error || "Could not read the formula",
            { id: "latex-ocr", duration: 8000 },
          );
          return;
        }
        setTex((t) => (t.trim() ? t + "\n" + d.latex : d.latex!));
        toast.success("Formula recognized — check and adjust the code", {
          id: "latex-ocr",
        });
      } catch {
        toast.error("Could not read the formula", { id: "latex-ocr" });
      } finally {
        setOcrBusy(false);
      }
    },
    [],
  );

  // Paste an equation screenshot anywhere in the dialog to OCR it.
  const onPaste = React.useCallback(
    (e: React.ClipboardEvent) => {
      const img = Array.from(e.clipboardData?.files || []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (img) {
        e.preventDefault();
        runOcr(img);
      }
    },
    [runOcr],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[90vh] flex-col sm:max-w-5xl"
        onPaste={onPaste}
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit LaTeX formula" : "Add LaTeX formula"}
          </DialogTitle>
          <DialogDescription>
            Type LaTeX, insert symbols from the toolbar, or upload / paste an
            image of an equation to convert it to LaTeX.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="flex-wrap">
            {PALETTE.map((g) => (
              <TabsTrigger key={g.key} value={g.key}>
                {g.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {PALETTE.map((g) => (
            <TabsContent key={g.key} value={g.key}>
              <div className={
                g.key === "blocks"
                  ? "flex max-h-44 flex-wrap items-start gap-1.5 overflow-y-auto pt-1"
                  : "flex max-h-28 flex-wrap items-start gap-1 overflow-y-auto pt-1"
              }>
                {g.items.map((item) => (
                  <SymbolButton
                    key={item.insert}
                    item={item}
                    small={g.key === "blocks"}
                    onInsert={insertAtCursor}
                  />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-1.5">
            <div className="flex h-7 items-center justify-between">
              <span className="text-muted-foreground text-xs font-medium">
                LaTeX code
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={ocrBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  {ocrBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ImageUp className="size-3.5" />
                  )}
                  Image to LaTeX
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!tex.trim()}
                      onClick={() => setTex(cleanMathSource(tex))}
                    >
                      <Sparkles className="size-3.5" /> Clean
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Convert pasted unicode math (x², α, √…) to LaTeX
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <Textarea
              ref={areaRef}
              value={tex}
              onChange={(e) => setTex(e.target.value)}
              placeholder={"\\frac{a}{b} + \\sqrt{x^2 + y^2}"}
              spellCheck={false}
              autoFocus
              className="min-h-52 flex-1 resize-none font-mono text-sm"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
              }}
            />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
            <div className="flex h-7 items-center">
              <span className="text-muted-foreground text-xs font-medium">
                Preview
              </span>
            </div>
            <div className="bg-muted/30 flex min-h-52 flex-1 items-center justify-center overflow-auto rounded-md border p-4">
              {tex.trim() ? (
                <div
                  className="datac-math max-w-full"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <span className="text-muted-foreground text-sm">
                  The formula preview shows here.
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canCommit} onClick={commit}>
            {mode === "edit" ? "Update" : "Add"}
          </Button>
        </DialogFooter>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) runOcr(f);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
