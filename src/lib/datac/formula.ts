// Tiny spreadsheet-formula evaluator for table cards. Pure and dependency
// free — tokenizer → recursive-descent parser → evaluator. No eval().
//
//   =SUM(A1:A3) * 1.2       =IF(C2, "paid", "due")      =ROUND(B1 / B2, 2)
//
// Columns are addressed A, B, C… (left to right), rows 1-based. Formula
// cells may reference other formula cells; cycles resolve to #CYCLE!.

export type FormulaValue = number | string | boolean | null;

/* ---- errors -------------------------------------------------------------- */
export class FormulaError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
const ERR = (code: string) => new FormulaError(code);

/* ---- tokenizer ----------------------------------------------------------- */
type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ref"; col: number; row: number }
  | { t: "ident"; v: string }
  | { t: "op"; v: string };

// Column letters → 0-based index: A=0 … Z=25, AA=26 …
export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i))!;
      out.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ch === '"') {
      const end = src.indexOf('"', i + 1);
      if (end === -1) throw ERR("#ERR!");
      out.push({ t: "str", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      const m = /^[A-Za-z]+[0-9]*/.exec(src.slice(i))!;
      const word = m[0];
      const ref = /^([A-Za-z]+)([0-9]+)$/.exec(word);
      if (ref)
        out.push({
          t: "ref",
          col: colIndex(ref[1].toUpperCase()),
          row: parseInt(ref[2], 10) - 1,
        });
      else out.push({ t: "ident", v: word.toUpperCase() });
      i += word.length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/^%=<>&(),:".includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    throw ERR("#ERR!");
  }
  return out;
}

/* ---- parser (precedence climbing) ---------------------------------------- */
type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "ref"; col: number; row: number }
  | { k: "range"; from: { col: number; row: number }; to: { col: number; row: number } }
  | { k: "call"; name: string; args: Node[] }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node };

function parse(tokens: Token[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expectOp = (v: string) => {
    const t = next();
    if (!t || t.t !== "op" || t.v !== v) throw ERR("#ERR!");
  };

  // comparison < concat < add < mul < unary < power < atom
  function comparison(): Node {
    let a = concat();
    while (peek()?.t === "op" && ["=", "<>", "<", "<=", ">", ">="].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      a = { k: "bin", op, a, b: concat() };
    }
    return a;
  }
  function concat(): Node {
    let a = additive();
    while (peek()?.t === "op" && (peek() as { v: string }).v === "&") {
      next();
      a = { k: "bin", op: "&", a, b: additive() };
    }
    return a;
  }
  function additive(): Node {
    let a = multiplicative();
    while (peek()?.t === "op" && ["+", "-"].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      a = { k: "bin", op, a, b: multiplicative() };
    }
    return a;
  }
  function multiplicative(): Node {
    let a = unary();
    while (peek()?.t === "op" && ["*", "/", "%"].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      a = { k: "bin", op, a, b: unary() };
    }
    return a;
  }
  function unary(): Node {
    if (peek()?.t === "op" && ["-", "+"].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      return { k: "un", op, a: unary() };
    }
    return power();
  }
  function power(): Node {
    const a = atom();
    if (peek()?.t === "op" && (peek() as { v: string }).v === "^") {
      next();
      return { k: "bin", op: "^", a, b: unary() }; // right-assoc
    }
    return a;
  }
  function atom(): Node {
    const t = next();
    if (!t) throw ERR("#ERR!");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.t === "ref") {
      // A1:B3 range
      if (peek()?.t === "op" && (peek() as { v: string }).v === ":") {
        next();
        const to = next();
        if (!to || to.t !== "ref") throw ERR("#ERR!");
        return {
          k: "range",
          from: { col: t.col, row: t.row },
          to: { col: to.col, row: to.row },
        };
      }
      return { k: "ref", col: t.col, row: t.row };
    }
    if (t.t === "ident") {
      // function call or constant (PI)
      if (peek()?.t === "op" && (peek() as { v: string }).v === "(") {
        next();
        const args: Node[] = [];
        if (!(peek()?.t === "op" && (peek() as { v: string }).v === ")")) {
          args.push(comparison());
          while (peek()?.t === "op" && (peek() as { v: string }).v === ",") {
            next();
            args.push(comparison());
          }
        }
        expectOp(")");
        return { k: "call", name: t.v, args };
      }
      return { k: "call", name: t.v, args: [] };
    }
    if (t.t === "op" && t.v === "(") {
      const inner = comparison();
      expectOp(")");
      return inner;
    }
    throw ERR("#ERR!");
  }

  const root = comparison();
  if (pos !== tokens.length) throw ERR("#ERR!");
  return root;
}

/* ---- evaluator ------------------------------------------------------------ */
const num = (v: FormulaValue): number => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null || v === "") return 0;
  const n = parseFloat(String(v));
  if (Number.isNaN(n)) throw ERR("#ERR!");
  return n;
};
const bool = (v: FormulaValue): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (v === null || v === "") return false;
  return true;
};
const str = (v: FormulaValue): string => (v === null ? "" : String(v));

// Aggregate helpers skip blanks (null / "") and flatten ranges.
const numbers = (vals: FormulaValue[]) =>
  vals.filter((v) => v !== null && v !== "").map(num);

type Fn = (args: FormulaValue[][], flat: FormulaValue[]) => FormulaValue;
const FUNCTIONS: Record<string, Fn> = {
  SUM: (_a, flat) => numbers(flat).reduce((s, n) => s + n, 0),
  AVERAGE: (_a, flat) => {
    const ns = numbers(flat);
    if (!ns.length) throw ERR("#DIV/0!");
    return ns.reduce((s, n) => s + n, 0) / ns.length;
  },
  MIN: (_a, flat) => Math.min(...numbers(flat)),
  MAX: (_a, flat) => Math.max(...numbers(flat)),
  COUNT: (_a, flat) => numbers(flat).length,
  ABS: (_a, flat) => Math.abs(num(flat[0])),
  ROUND: (_a, flat) => {
    const p = flat.length > 1 ? num(flat[1]) : 0;
    const k = 10 ** p;
    return Math.round(num(flat[0]) * k) / k;
  },
  FLOOR: (_a, flat) => Math.floor(num(flat[0])),
  CEIL: (_a, flat) => Math.ceil(num(flat[0])),
  SQRT: (_a, flat) => Math.sqrt(num(flat[0])),
  POW: (_a, flat) => num(flat[0]) ** num(flat[1]),
  MOD: (_a, flat) => {
    const d = num(flat[1]);
    if (d === 0) throw ERR("#DIV/0!");
    return num(flat[0]) % d;
  },
  EXP: (_a, flat) => Math.exp(num(flat[0])),
  LN: (_a, flat) => Math.log(num(flat[0])),
  LOG: (_a, flat) =>
    flat.length > 1
      ? Math.log(num(flat[0])) / Math.log(num(flat[1]))
      : Math.log10(num(flat[0])),
  LOG10: (_a, flat) => Math.log10(num(flat[0])),
  SIN: (_a, flat) => Math.sin(num(flat[0])),
  COS: (_a, flat) => Math.cos(num(flat[0])),
  TAN: (_a, flat) => Math.tan(num(flat[0])),
  ASIN: (_a, flat) => Math.asin(num(flat[0])),
  ACOS: (_a, flat) => Math.acos(num(flat[0])),
  ATAN: (_a, flat) => Math.atan(num(flat[0])),
  PI: () => Math.PI,
  IF: (args) => {
    if (args.length < 2) throw ERR("#ERR!");
    return bool(args[0][0])
      ? args[1][0]
      : args.length > 2
        ? args[2][0]
        : null;
  },
  AND: (_a, flat) => flat.every(bool),
  OR: (_a, flat) => flat.some(bool),
  NOT: (_a, flat) => !bool(flat[0]),
  LEN: (_a, flat) => str(flat[0]).length,
  CONCAT: (_a, flat) => flat.map(str).join(""),
};

export type ResolveCell = (col: number, row: number) => FormulaValue;

function evalNode(node: Node, resolve: ResolveCell): FormulaValue {
  switch (node.k) {
    case "num":
      return node.v;
    case "str":
      return node.v;
    case "ref":
      return resolve(node.col, node.row);
    case "range":
      throw ERR("#ERR!"); // ranges are only valid as function arguments
    case "un": {
      const v = num(evalNode(node.a, resolve));
      return node.op === "-" ? -v : v;
    }
    case "bin": {
      const a = evalNode(node.a, resolve);
      const b = evalNode(node.b, resolve);
      switch (node.op) {
        case "+":
          return num(a) + num(b);
        case "-":
          return num(a) - num(b);
        case "*":
          return num(a) * num(b);
        case "/": {
          const d = num(b);
          if (d === 0) throw ERR("#DIV/0!");
          return num(a) / d;
        }
        case "%": {
          const d = num(b);
          if (d === 0) throw ERR("#DIV/0!");
          return num(a) % d;
        }
        case "^":
          return num(a) ** num(b);
        case "&":
          return str(a) + str(b);
        case "=":
          return a === b || num0(a) === num0(b);
        case "<>":
          return !(a === b || num0(a) === num0(b));
        case "<":
          return cmp(a, b) < 0;
        case "<=":
          return cmp(a, b) <= 0;
        case ">":
          return cmp(a, b) > 0;
        case ">=":
          return cmp(a, b) >= 0;
        default:
          throw ERR("#ERR!");
      }
    }
    case "call": {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw ERR("#NAME?");
      // each argument becomes a list (ranges flatten to their cells)
      const args: FormulaValue[][] = node.args.map((a) => {
        if (a.k === "range") {
          const vals: FormulaValue[] = [];
          const [c0, c1] = [Math.min(a.from.col, a.to.col), Math.max(a.from.col, a.to.col)];
          const [r0, r1] = [Math.min(a.from.row, a.to.row), Math.max(a.from.row, a.to.row)];
          for (let r = r0; r <= r1; r++)
            for (let c = c0; c <= c1; c++) vals.push(resolve(c, r));
          return vals;
        }
        return [evalNode(a, resolve)];
      });
      return fn(args, args.flat());
    }
  }
}

// Loose numeric coercion for equality that never throws.
const num0 = (v: FormulaValue) => {
  try {
    return num(v);
  } catch {
    return NaN;
  }
};
const cmp = (a: FormulaValue, b: FormulaValue): number => {
  if (typeof a === "string" && typeof b === "string")
    return a.localeCompare(b);
  return num(a) - num(b);
};

/* ---- public API ------------------------------------------------------------ */
export const isFormula = (v: unknown): v is string =>
  typeof v === "string" && v.startsWith("=");

// Evaluate `src` ("=SUM(A1:A3)"). `resolve` returns the *computed* value of
// another cell and must throw FormulaError("#CYCLE!") on re-entry.
export function evaluateFormula(
  src: string,
  resolve: ResolveCell,
): FormulaValue {
  const body = src.startsWith("=") ? src.slice(1) : src;
  if (!body.trim()) return null;
  return evalNode(parse(tokenize(body)), resolve);
}
