// Selection / caret helpers for the contentEditable block editor.

export function placeCaret(el: HTMLElement, atEnd = false) {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  sel.removeAllRanges();
  sel.addRange(r);
}

export function caretAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const r = sel.getRangeAt(0).cloneRange();
  const probe = document.createRange();
  probe.selectNodeContents(el);
  probe.setEnd(r.startContainer, r.startOffset);
  return probe.toString().length === 0;
}

export function caretAtEnd(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const r = sel.getRangeAt(0).cloneRange();
  const probe = document.createRange();
  probe.selectNodeContents(el);
  probe.setStart(r.endContainer, r.endOffset);
  return probe.toString().length === 0;
}

export function textBeforeCaret(el: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return "";
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return r.toString();
}

// Split an editable element at the caret, returning the trailing HTML and
// leaving the leading HTML in place.
export function splitHtmlAtCaret(el: HTMLElement): { before: string; after: string } {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return { before: el.innerHTML, after: "" };
  const range = sel.getRangeAt(0);
  if (!range.collapsed) range.deleteContents();
  const tail = document.createRange();
  tail.selectNodeContents(el);
  tail.setStart(range.endContainer, range.endOffset);
  const frag = tail.cloneRange().cloneContents();
  const holder = document.createElement("div");
  holder.appendChild(frag);
  const after = holder.innerHTML;
  // remove the tail from the original
  tail.deleteContents();
  const before = el.innerHTML;
  return { before, after };
}

// Place the caret at a given text offset inside an element.
export function placeCaretAtOffset(el: HTMLElement, offset: number) {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  let remaining = offset;
  let placed = false;
  const walk = (node: Node) => {
    if (placed) return;
    if (node.nodeType === 3) {
      const len = (node as Text).length;
      if (remaining <= len) {
        r.setStart(node, remaining);
        placed = true;
        return;
      }
      remaining -= len;
    } else {
      node.childNodes.forEach(walk);
    }
  };
  walk(el);
  if (!placed) {
    r.selectNodeContents(el);
    r.collapse(false);
  } else {
    r.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(r);
}
