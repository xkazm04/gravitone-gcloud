// Raw-value lint for *.module.css. A declaration may name a design value only through a token:
// no colour literal, no px literal, and every var(--x) must be a token of the source.
// Allow-list (each entry has a reason):
//   0 / 0px     zero is not a design value
//   1px         the hairline border width; its colour is still a token
//   100%        needs no entry: only colour and px literals are policed
//   @media ...  a custom property cannot appear in a media prelude, so breakpoints stay literal
export interface Finding {
  readonly line: number;
  readonly kind: "raw-colour" | "raw-px" | "unknown-var";
  readonly text: string;
}

export interface LintResult {
  readonly findings: readonly Finding[];
  readonly declarations: number;
  readonly varRefs: number;
}

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;
const PX = /(?<![\w.#-])(-?\d*\.?\d+)px\b/g;
const VAR = /var\(\s*(--[\w-]+)/g;
// A declaration is `prop: value` opened by `{` or `;` and closed by `;` or `}`.
const DECL = /[{;]\s*(-{0,2}[a-zA-Z][\w-]*)\s*:\s*([^;{}]*)(?=[;}])/g;

function blank(text: string): string {
  // Replace with spaces, keeping newlines, so offsets still map to lines.
  return text.replace(/[^\n]/g, " ");
}

function strip(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/@media[^{]*/g, blank)
    .replace(/url\([^)]*\)/g, blank)
    .replace(/"(?:[^"\\n]|\.)*"|'(?:[^'\\n]|\.)*'/g, blank);
}

export function lintCss(css: string, allowedVars: ReadonlySet<string>): LintResult {
  const text = strip(css);
  const findings: Finding[] = [];
  let declarations = 0;
  let varRefs = 0;
  // A custom property declared in this same file is a legal var() target; its own value
  // still goes through the raw-value rules below.
  const local = new Set<string>();
  for (const d of text.matchAll(DECL)) {
    if ((d[1] ?? "").startsWith("--")) local.add((d[1] ?? "").slice(2));
  }
  const lineAt = (offset: number): number => text.slice(0, offset).split("\n").length;

  for (const m of text.matchAll(DECL)) {
    declarations++;
    const value = m[2] ?? "";
    const base = (m.index ?? 0) + m[0].length - value.length;
    for (const v of value.matchAll(VAR)) {
      varRefs++;
      const name = (v[1] ?? "").slice(2);
      if (!allowedVars.has(name) && !local.has(name)) {
        findings.push({ line: lineAt(base + (v.index ?? 0)), kind: "unknown-var", text: v[1] ?? "" });
      }
    }
    // The var() name is not a literal; blank it so `--r-chip` never reads as a value.
    const bare = value.replace(VAR, (s) => blank(s));
    for (const c of bare.matchAll(COLOUR)) {
      findings.push({ line: lineAt(base + (c.index ?? 0)), kind: "raw-colour", text: c[0] });
    }
    for (const p of bare.matchAll(PX)) {
      const n = Number(p[1]);
      if (n === 0 || p[1] === "1") continue;
      findings.push({ line: lineAt(base + (p.index ?? 0)), kind: "raw-px", text: p[0] });
    }
  }
  return { findings, declarations, varRefs };
}
