import katex from "katex";

// Render a LaTeX string to an HTML string (display mode).
export function renderMathHtml(tex: string): string {
  const t = String(tex ?? "").trim();
  if (!t) return "";
  try {
    return katex.renderToString(t, {
      displayMode: true,
      throwOnError: false,
      output: "htmlAndMathml",
    });
  } catch {
    return `<span class="text-destructive font-mono text-sm">${t.replace(
      /</g,
      "&lt;",
    )}</span>`;
  }
}

/* ---- Unicode → LaTeX best-effort cleaner (ported from legacy math.js) --- */
const MATH_SUP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6",
  "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-", "⁼": "=", "⁽": "(",
  "⁾": ")", "ⁿ": "n", "ⁱ": "i", "ᵀ": "T",
};
const MATH_SUB: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6",
  "₇": "7", "₈": "8", "₉": "9", "₊": "+", "₋": "-", "₌": "=", "₍": "(",
  "₎": ")", "ₐ": "a", "ₑ": "e", "ₒ": "o", "ₓ": "x", "ₕ": "h", "ₖ": "k",
  "ₗ": "l", "ₘ": "m", "ₙ": "n", "ₚ": "p", "ₛ": "s", "ₜ": "t",
};
const MATH_SYM: Record<string, string> = {
  "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta",
  "ε": "\\epsilon", "ζ": "\\zeta", "η": "\\eta", "θ": "\\theta",
  "ϑ": "\\vartheta", "ι": "\\iota", "κ": "\\kappa", "λ": "\\lambda",
  "μ": "\\mu", "ν": "\\nu", "ξ": "\\xi", "π": "\\pi", "ρ": "\\rho",
  "σ": "\\sigma", "τ": "\\tau", "υ": "\\upsilon", "φ": "\\phi",
  "ϕ": "\\phi", "χ": "\\chi", "ψ": "\\psi", "ω": "\\omega",
  "Γ": "\\Gamma", "Δ": "\\Delta", "Θ": "\\Theta", "Λ": "\\Lambda",
  "Ξ": "\\Xi", "Π": "\\Pi", "Σ": "\\Sigma", "Φ": "\\Phi", "Ψ": "\\Psi",
  "Ω": "\\Omega", "×": "\\times", "⋅": "\\cdot", "·": "\\cdot",
  "÷": "\\div", "∗": "*", "∘": "\\circ", "±": "\\pm", "∓": "\\mp",
  "≈": "\\approx", "≠": "\\neq", "≡": "\\equiv", "≤": "\\le", "≥": "\\ge",
  "≪": "\\ll", "≫": "\\gg", "∝": "\\propto", "∼": "\\sim", "≅": "\\cong",
  "→": "\\to", "←": "\\leftarrow", "↔": "\\leftrightarrow",
  "⇒": "\\Rightarrow", "⇐": "\\Leftarrow", "⇔": "\\Leftrightarrow",
  "↦": "\\mapsto", "∈": "\\in", "∉": "\\notin", "∋": "\\ni",
  "⊂": "\\subset", "⊆": "\\subseteq", "⊃": "\\supset", "⊇": "\\supseteq",
  "∪": "\\cup", "∩": "\\cap", "∅": "\\emptyset", "∑": "\\sum",
  "∏": "\\prod", "∫": "\\int", "∬": "\\iint", "∮": "\\oint",
  "√": "\\sqrt", "∞": "\\infty", "∇": "\\nabla", "∂": "\\partial",
  "∀": "\\forall", "∃": "\\exists", "¬": "\\neg", "∧": "\\wedge",
  "∨": "\\vee", "⊕": "\\oplus", "⊗": "\\otimes", "⟨": "\\langle",
  "⟩": "\\rangle", "⌊": "\\lfloor", "⌋": "\\rfloor", "⌈": "\\lceil",
  "⌉": "\\rceil", "…": "\\dots", "⋯": "\\cdots", "⋮": "\\vdots",
  "⋱": "\\ddots", "ℝ": "\\mathbb{R}", "ℕ": "\\mathbb{N}",
  "ℤ": "\\mathbb{Z}", "ℚ": "\\mathbb{Q}", "ℂ": "\\mathbb{C}", "ℰ": "E",
  "′": "'", "″": "''", "−": "-", "∣": "|", "∥": "\\|",
};

// Known function names rendered as upright operators (with proper spacing).
const MATH_OPS = [
  "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "max", "min",
  "sin", "cos", "tan", "sec", "csc", "cot", "log", "ln", "exp", "lim",
  "det", "gcd", "sup", "inf", "arg", "deg", "dim", "ker",
];

function escRe(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cleanMathSource(raw: string): string {
  let s = String(raw ?? "").normalize("NFC");
  // Recover scripts encoded by zero-width markers in copied rendered math: a
  // base letter followed by a letter/digit run terminated by U+200B is a
  // script run. Copied text can't tell sub from super, so treat it as a
  // subscript (the common case) — e.g. "Qdepth​" -> "Q_{depth}".
  s = s.replace(/(\p{L})([\p{L}\p{N}]+)​/gu, (_, b, r) => `${b}_{${r}}`);
  s = s.replace(/[​‌‍⁠﻿]/g, "");
  s = s.replace(/[  -   　]/g, " ");
  s = s.replace(/(\S)̇/g, "\\dot{$1}");
  s = s.replace(/(\S)̂/g, "\\hat{$1}");
  s = s.replace(/(\S)̄/g, "\\bar{$1}");
  s = s.replace(/(\S)̃/g, "\\tilde{$1}");
  s = s.replace(/(\S)⃗/g, "\\vec{$1}");
  s = s.replace(/˙/g, "\\dot ").replace(/ˆ/g, "\\hat ").replace(/¯/g, "\\bar ");
  s = s.replace(/\r\n?/g, "\n").replace(/[ \t]*\n[ \t]*/g, " ");
  s = s.replace(
    new RegExp("[" + Object.keys(MATH_SUP).map(escRe).join("") + "]+", "g"),
    (m) => "^{" + Array.from(m).map((c) => MATH_SUP[c]).join("") + "}",
  );
  s = s.replace(
    new RegExp("[" + Object.keys(MATH_SUB).map(escRe).join("") + "]+", "g"),
    (m) => "_{" + Array.from(m).map((c) => MATH_SUB[c]).join("") + "}",
  );
  for (const k of Object.keys(MATH_SYM)) s = s.split(k).join(MATH_SYM[k] + " ");
  // Function names -> operators (\max, \min, \sin, …); \\? avoids double-escaping.
  s = s.replace(
    new RegExp("\\\\?\\b(" + MATH_OPS.join("|") + ")\\b", "g"),
    (_, n) => "\\" + n,
  );
  s = s.replace(/[ \t]{2,}/g, " ").replace(/\s+$/g, "").replace(/^\s+/g, "");
  return s;
}

/* ---- fraction heuristic (best-effort; opt-in) --------------------------
 * Copied rendered fractions arrive flattened: \frac{A}{B} becomes "AB" with no
 * separator. The tell is an operand immediately followed by another operand
 * (a juxtaposition that never occurs in well-formed math), where both the
 * expression ending at the seam and the one starting after it are additive
 * (contain + or -). We wrap that region as \frac{first}{second}. Returns null
 * when no confident seam is found — a clean paste is never touched. */
type MTok = { t: "op" | "add" | "delim" | "oth"; v: string; i: number; end: number };

const OPERAND_RE =
  /^(?:\\[A-Za-z]+|[A-Za-z0-9])(?:\s*_(?:\{[^{}]*\}|[A-Za-z0-9]))?(?:\s*\^(?:\{[^{}]*\}|[A-Za-z0-9]))?/;

function tokenizeMath(s: string): MTok[] {
  const toks: MTok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "+" || c === "-") { toks.push({ t: "add", v: c, i, end: i + 1 }); i++; continue; }
    if ("(),{}[]|".includes(c)) { toks.push({ t: "delim", v: c, i, end: i + 1 }); i++; continue; }
    if ("*/=<>".includes(c)) { toks.push({ t: "oth", v: c, i, end: i + 1 }); i++; continue; }
    const m = OPERAND_RE.exec(s.slice(i));
    if (m && m[0]) { toks.push({ t: "op", v: m[0], i, end: i + m[0].length }); i += m[0].length; continue; }
    toks.push({ t: "oth", v: c, i, end: i + 1 }); i++;
  }
  return toks;
}

export function guessFraction(tex: string): string | null {
  const s = String(tex ?? "");
  const toks = tokenizeMath(s);
  // A "complex" operand carries a script or is a \command — the seam of a real
  // flattened fraction (e.g. θ_{ideal}θ_{down}) has these, whereas implicit
  // multiplication of bare letters (bx, mc) does not.
  const isComplex = (v: string) => /[_^]/.test(v) || /^\\[A-Za-z]/.test(v);
  for (let k = 0; k + 1 < toks.length; k++) {
    if (toks[k].t !== "op" || toks[k + 1].t !== "op") continue;
    if (!isComplex(toks[k].v) && !isComplex(toks[k + 1].v)) continue;
    // Expand left over an additive run (operands + and -) up to a boundary.
    let a = k;
    let leftAdd = false;
    while (a - 1 >= 0 && (toks[a - 1].t === "op" || toks[a - 1].t === "add")) {
      a--;
      if (toks[a].t === "add") leftAdd = true;
    }
    // Expand right similarly.
    let b = k + 1;
    let rightAdd = false;
    while (b + 1 < toks.length && (toks[b + 1].t === "op" || toks[b + 1].t === "add")) {
      b++;
      if (toks[b].t === "add") rightAdd = true;
    }
    if (!leftAdd || !rightAdd) continue; // both halves must be additive
    const num = s.slice(toks[a].i, toks[k].end).trim();
    const den = s.slice(toks[k + 1].i, toks[b].end).trim();
    if (!num || !den) continue;
    return (
      s.slice(0, toks[a].i) +
      `\\frac{${num}}{${den}}` +
      s.slice(toks[b].end)
    );
  }
  return null;
}
