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

function escRe(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cleanMathSource(raw: string): string {
  let s = String(raw ?? "").normalize("NFC");
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
  s = s.replace(/[ \t]{2,}/g, " ").replace(/\s+$/g, "").replace(/^\s+/g, "");
  return s;
}
