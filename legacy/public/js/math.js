'use strict';

/* ================================================================== *
 *  Math / equation blocks
 *  - render LaTeX with the vendored KaTeX (offline, no CDN)
 *  - a docked side panel to paste messy math, auto-clean it into
 *    LaTeX, edit with a live preview, then insert into the page.
 * ================================================================== */

/* ---- Unicode → LaTeX best-effort cleaner --------------------------
 * Math copied from ChatGPT / web pages / PDFs arrives as Unicode with
 * zero-width spaces and combining marks. This makes a sensible LaTeX
 * starting point; the editable field + live preview let you finish it. */
const MATH_SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ⁱ': 'i', 'ᵀ': 'T' };
const MATH_SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')', 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't' };
const MATH_SYM = {
  // greek (lower)
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\epsilon', 'ζ': '\\zeta', 'η': '\\eta',
  'θ': '\\theta', 'ϑ': '\\vartheta', 'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu', 'ν': '\\nu',
  'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\phi',
  'ϕ': '\\phi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  // greek (upper)
  'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma',
  'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',
  // operators / relations
  '×': '\\times', '⋅': '\\cdot', '·': '\\cdot', '÷': '\\div', '∗': '*', '∘': '\\circ',
  '±': '\\pm', '∓': '\\mp', '≈': '\\approx', '≠': '\\neq', '≡': '\\equiv', '≤': '\\le', '≥': '\\ge',
  '≪': '\\ll', '≫': '\\gg', '∝': '\\propto', '∼': '\\sim', '≅': '\\cong',
  '→': '\\to', '←': '\\leftarrow', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow', '⇐': '\\Leftarrow',
  '⇔': '\\Leftrightarrow', '↦': '\\mapsto',
  '∈': '\\in', '∉': '\\notin', '∋': '\\ni', '⊂': '\\subset', '⊆': '\\subseteq', '⊃': '\\supset',
  '⊇': '\\supseteq', '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset',
  '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∮': '\\oint',
  '√': '\\sqrt', '∞': '\\infty', '∇': '\\nabla', '∂': '\\partial', '∀': '\\forall', '∃': '\\exists',
  '¬': '\\neg', '∧': '\\wedge', '∨': '\\vee', '⊕': '\\oplus', '⊗': '\\otimes',
  '⟨': '\\langle', '⟩': '\\rangle', '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil',
  '…': '\\dots', '⋯': '\\cdots', '⋮': '\\vdots', '⋱': '\\ddots', 'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}',
  'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}', 'ℰ': 'E', '′': "'", '″': "''",
  // punctuation that KaTeX chokes on if left as raw Unicode
  '−': '-', '∣': '|', '∥': '\\|',
};

function cleanMathSource(raw) {
  let s = String(raw == null ? '' : raw).normalize('NFC');
  // strip zero-width / BOM / word-joiner
  s = s.replace(/[​‌‍⁠﻿]/g, '');
  // exotic spaces → normal space
  s = s.replace(/[       ]/g, ' ');
  // combining marks attached to a base char → LaTeX accent
  s = s.replace(/(\S)̇/g, '\\dot{$1}');    // dot above  (θ̇)
  s = s.replace(/(\S)̂/g, '\\hat{$1}');    // circumflex (x̂)
  s = s.replace(/(\S)̄/g, '\\bar{$1}');    // macron / bar
  s = s.replace(/(\S)̃/g, '\\tilde{$1}');  // tilde
  s = s.replace(/(\S)⃗/g, '\\vec{$1}');    // combining right arrow above
  // lone spacing modifiers (appear split onto their own line) → accent hints
  s = s.replace(/˙/g, '\\dot ').replace(/ˆ/g, '\\hat ').replace(/¯/g, '\\bar ');
  // collapse the vertical layout many sources use (one atom per line) into one line
  s = s.replace(/\r\n?/g, '\n').replace(/[ \t]*\n[ \t]*/g, ' ');
  // superscript / subscript runs
  s = s.replace(new RegExp('[' + Object.keys(MATH_SUP).map(escRe).join('') + ']+', 'g'),
    (m) => '^{' + Array.from(m).map((c) => MATH_SUP[c]).join('') + '}');
  s = s.replace(new RegExp('[' + Object.keys(MATH_SUB).map(escRe).join('') + ']+', 'g'),
    (m) => '_{' + Array.from(m).map((c) => MATH_SUB[c]).join('') + '}');
  // symbols → commands (add a trailing space so \theta t stays two tokens)
  for (const k of Object.keys(MATH_SYM)) s = s.split(k).join(MATH_SYM[k] + ' ');
  // tidy whitespace
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/\s+$/g, '').replace(/^\s+/g, '');
  return s;
}
function escRe(c) { return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ---- render a LaTeX string into an element -------------------------- */
function renderMathInto(el, tex) {
  const t = String(tex == null ? '' : tex).trim();
  el.innerHTML = '';
  if (!t) { el.innerHTML = '<span class="math-empty">Empty equation — click to edit</span>'; return; }
  if (typeof katex === 'undefined') { el.textContent = t; return; }
  try {
    katex.render(t, el, { displayMode: true, throwOnError: false, output: 'htmlAndMathml' });
  } catch (e) {
    el.innerHTML = '<span class="math-error"></span>';
    $('.math-error', el).textContent = t;
  }
}

/* ---- the math block ------------------------------------------------- */
function makeMath(tex) {
  const b = newBlockEl('math');
  b.dataset.tex = tex || '';
  const body = $('.block-body', b);
  body.contentEditable = 'false';
  const holder = document.createElement('div');
  holder.className = 'math-render';
  holder.contentEditable = 'false';
  holder.title = 'Click to edit equation';
  holder.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openMathPanel({ block: b }); });
  renderMathInto(holder, b.dataset.tex);
  body.appendChild(holder);
  return b;
}
// re-render an existing math block's visible output after its tex changes
function refreshMathBlock(block) {
  const holder = $('.math-render', block);
  if (holder) renderMathInto(holder, block.dataset.tex);
}

/* ---- the side panel ------------------------------------------------- */
const mathPanel = $('#math-panel');
const mpSource = $('#mp-source');
const mpLatex = $('#mp-latex');
const mpPreview = $('#mp-preview');
let mathTarget = null;   // { block } to edit in place, or { replaceBlock } to insert new

function openMathPanel(target) {
  mathTarget = target;
  const editing = !!(target && target.block);
  mpSource.value = '';
  mpLatex.value = editing ? (target.block.dataset.tex || '') : '';
  renderMathInto(mpPreview, mpLatex.value);
  $('#mp-insert').textContent = editing ? 'Update' : 'Insert to page';
  mathPanel.hidden = false;
  setTimeout(() => (editing ? mpLatex : mpSource).focus(), 0);
}
function closeMathPanel() { mathPanel.hidden = true; mathTarget = null; }

function mathPanelCommit() {
  const tex = mpLatex.value.trim();
  if (mathTarget && mathTarget.block) {
    // edit in place
    mathTarget.block.dataset.tex = tex;
    refreshMathBlock(mathTarget.block);
  } else if (mathTarget && mathTarget.replaceBlock) {
    const el = makeMath(tex);
    mathTarget.replaceBlock.replaceWith(el);
    const nb = newBlockEl('paragraph'); el.after(nb);
    refresh(); ensureTrailingParagraph();
    placeCaret($('.block-body', nb), true);
  }
  closeMathPanel();
  captureHistory(); queueSave();
}

if (mathPanel) {
  // paste into the source box → auto-clean into the LaTeX field
  mpSource.addEventListener('paste', () => {
    setTimeout(() => {
      const cleaned = cleanMathSource(mpSource.value);
      if (cleaned) { mpLatex.value = cleaned; renderMathInto(mpPreview, cleaned); }
    }, 0);
  });
  $('#mp-clean').addEventListener('click', () => {
    const cleaned = cleanMathSource(mpSource.value || mpLatex.value);
    mpLatex.value = cleaned; renderMathInto(mpPreview, cleaned); mpLatex.focus();
  });
  // live preview as you edit the LaTeX
  mpLatex.addEventListener('input', () => renderMathInto(mpPreview, mpLatex.value));
  // pasting straight into the LaTeX field also auto-cleans the pasted chunk
  // (cleaning plain ASCII LaTeX is a no-op, so hand-written LaTeX is untouched)
  mpLatex.addEventListener('paste', (e) => {
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (t == null) return;
    e.preventDefault();
    const cleaned = cleanMathSource(t);
    mpLatex.setRangeText(cleaned, mpLatex.selectionStart, mpLatex.selectionEnd, 'end');
    renderMathInto(mpPreview, mpLatex.value);
  });
  // quick-insert snippets at the caret
  $$('.mp-tools button', mathPanel).forEach((btn) => btn.addEventListener('click', () => {
    const ins = btn.dataset.ins || '';
    const start = mpLatex.selectionStart, end = mpLatex.selectionEnd;
    mpLatex.setRangeText(ins, start, end, 'end');
    mpLatex.focus(); renderMathInto(mpPreview, mpLatex.value);
  }));
  $('#mp-insert').addEventListener('click', mathPanelCommit);
  $('#mp-cancel').addEventListener('click', closeMathPanel);
  $('#mp-close').addEventListener('click', closeMathPanel);
  mathPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeMathPanel(); }
    // Cmd/Ctrl+Enter commits
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); mathPanelCommit(); }
  });
}
