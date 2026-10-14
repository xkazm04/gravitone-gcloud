// NEXT-STRUCTURE - the governance gates for packages/** (the new version's workspace).
//
//   node pipeline/next-gates.mts [--root <dir>] [--only boundaries,cycles,hygiene,size]
//
// Four checks over every .ts/.tsx under <root>/packages, each reporting its own
// denominator (walked / checked / skipped) and every violation as file:line:
//   boundaries  a package never reaches into app/ lib/ components/ pipeline/ or "@/";
//               layers run catalog < domain < kernel < producers and never import upward;
//               @gt/ui may import @gt/domain (pure, below it) and nothing else; one package reaches
//               another by package name, never by a relative path out of its own directory.
//   cycles      zero import cycles among packages/ files (Tarjan over resolved edges).
//   hygiene     zero `as unknown as`, `any`, JSON.parse outside packages/domain/src/door.ts,
//               raw keydown listeners (one named exemption: the keymap dispatcher may
//               hold exactly ONE), and swallowed catches.
//   size        no file over 400 lines.
//
// EXIT 0 clean · 1 violations · 2 could not run. A clean verdict over a walk that
// saw nothing is manufactured, so these are 2, never 0: no packages/ directory, no
// package inside it, or source files under a package's src/ or test/ that the walk
// did not turn into a single .ts/.tsx. A package with an empty src/ is a young
// package, not a broken instrument, and passes with a denominator of zero.
//
// Runs under plain `node` (type stripping): erasable TypeScript only.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type CheckName = "boundaries" | "cycles" | "hygiene" | "size";
const ALL_CHECKS: readonly CheckName[] = ["boundaries", "cycles", "hygiene", "size"];

type Violation = { file: string; line: number; message: string };
type Report = { check: CheckName; walked: number; checked: number; skipped: number; violations: Violation[] };
type Imp = { spec: string; line: number; typeOnly: boolean };
type Src = { rel: string; pkg: string; imports: Imp[]; sf: ts.SourceFile; lines: number };

const FORBIDDEN_ROOTS = ["app", "lib", "components", "pipeline"];
const LAYER_ORDER = ["catalog", "domain", "kernel", "producers"];
const MAX_LINES = 400;
const DOOR = "packages/domain/src/door.ts";
// The app's only keydown listener (plan §3.3: v1 had 30). Exempt by exact path, the
// way DOOR is, and for ONE listener: a second addEventListener("keydown") in the same
// file is a violation like any other, so the exemption cannot grow into a second bus.
const KEYMAP_DISPATCHER = "packages/ui/src/keymap/dispatch.ts";

class CouldNotRun extends Error {}

function parseArgs(argv: string[]): { root: string; only: CheckName[] } {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  let only: CheckName[] = [...ALL_CHECKS];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") {
      const v = argv[++i];
      if (v === undefined) throw new CouldNotRun("--root needs a directory");
      root = path.resolve(v);
    } else if (a === "--only") {
      const v = argv[++i];
      if (v === undefined) throw new CouldNotRun("--only needs a comma list");
      only = v.split(",").map((n) => {
        const hit = ALL_CHECKS.find((c) => c === n);
        if (hit === undefined) throw new CouldNotRun(`unknown check "${n}" (have ${ALL_CHECKS.join(", ")})`);
        return hit;
      });
    } else {
      throw new CouldNotRun(`unknown argument "${a}"`);
    }
  }
  return { root, only };
}

const posix = (p: string): string => p.split(path.sep).join("/");

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

const isSource = (f: string): boolean => /\.tsx?$/.test(f) && !f.endsWith(".d.ts");

function importsOf(sf: ts.SourceFile): Imp[] {
  const out: Imp[] = [];
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      out.push({ spec: n.moduleSpecifier.text, line: at(n), typeOnly: n.importClause?.isTypeOnly === true });
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      out.push({ spec: n.moduleSpecifier.text, line: at(n), typeOnly: n.isTypeOnly });
    } else if (ts.isCallExpression(n)) {
      const arg = n.arguments[0];
      const isDyn = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isReq = ts.isIdentifier(n.expression) && n.expression.text === "require";
      if ((isDyn || isReq) && arg !== undefined && ts.isStringLiteralLike(arg)) {
        out.push({ spec: arg.text, line: at(n), typeOnly: false });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function readPackages(root: string): { dirs: string[]; names: Map<string, string> } {
  const pkgRoot = path.join(root, "packages");
  if (!existsSync(pkgRoot) || !statSync(pkgRoot).isDirectory()) throw new CouldNotRun(`${posix(pkgRoot)} is not a directory`);
  const dirs: string[] = [];
  const names = new Map<string, string>();
  for (const e of readdirSync(pkgRoot, { withFileTypes: true })) {
    const manifest = path.join(pkgRoot, e.name, "package.json");
    if (!e.isDirectory() || !existsSync(manifest)) continue;
    dirs.push(e.name);
    const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
    const name = typeof parsed === "object" && parsed !== null && "name" in parsed ? (parsed as { name: unknown }).name : undefined;
    names.set(typeof name === "string" ? name : `@gt/${e.name}`, e.name);
  }
  if (dirs.length === 0) throw new CouldNotRun("packages/ holds no package (no <dir>/package.json)");
  return { dirs, names };
}

function load(root: string, dirs: string[]): { srcs: Src[]; skipped: number } {
  const srcs: Src[] = [];
  let skipped = 0;
  let sourceDirFiles = 0;
  for (const dir of dirs) {
    for (const f of listFiles(path.join(root, "packages", dir))) {
      const rel = posix(path.relative(root, f));
      if (/^packages\/[^/]+\/(src|test)\//.test(rel)) sourceDirFiles++;
      if (!/\.tsx?$/.test(f)) continue;
      if (!isSource(f)) { skipped++; continue; }
      const text = readFileSync(f, "utf8");
      const sf = ts.createSourceFile(f, text, ts.ScriptTarget.ES2023, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const lines = text.length === 0 ? 0 : text.replace(/\r?\n$/, "").split(/\r?\n/).length;
      srcs.push({ rel, pkg: dir, imports: importsOf(sf), sf, lines });
    }
  }
  if (srcs.length === 0 && sourceDirFiles > 0) throw new CouldNotRun(`${sourceDirFiles} file(s) under packages/*/src|test but zero .ts/.tsx walked`);
  return { srcs, skipped };
}

type Ctx = { root: string; names: Map<string, string>; srcs: Src[]; skipped: number };

/** Resolve an import to a packages/ file (rel path), or undefined when it leaves the walk. */
function resolveEdge(ctx: Ctx, from: Src, spec: string): string | undefined {
  const known = new Set(ctx.srcs.map((s) => s.rel));
  const hit = (base: string): string | undefined =>
    [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((c) => known.has(c));
  if (spec.startsWith(".")) return hit(posix(path.posix.normalize(path.posix.join(path.posix.dirname(from.rel), spec))));
  for (const [name, dir] of ctx.names) {
    if (spec.startsWith(`${name}/`)) return hit(`packages/${dir}/src/${spec.slice(name.length + 1).replace(/\.tsx?$/, "")}`);
  }
  return undefined;
}

function packageOf(ctx: Ctx, spec: string): string | undefined {
  for (const [name, dir] of ctx.names) if (spec === name || spec.startsWith(`${name}/`)) return dir;
  return undefined;
}

function boundaries(ctx: Ctx): Report {
  const violations: Violation[] = [];
  let skipped = 0;
  for (const s of ctx.srcs) {
    const layer = LAYER_ORDER.indexOf(s.pkg);
    if (layer < 0 && s.pkg !== "ui") skipped++;
    for (const imp of s.imports) {
      const bad = (message: string): void => { violations.push({ file: s.rel, line: imp.line, message }); };
      const spec = imp.spec;
      if (spec === "@/" || spec.startsWith("@/")) { bad(`imports "${spec}" (the app alias)`); continue; }
      const top = spec.split("/")[0] ?? "";
      if (FORBIDDEN_ROOTS.includes(top)) { bad(`imports "${spec}" from outside packages/`); continue; }
      if (spec.startsWith(".")) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(s.rel), spec));
        if (!target.startsWith(`packages/${s.pkg}/`)) {
          const into = FORBIDDEN_ROOTS.find((r) => target.startsWith(`${r}/`));
          bad(`relative import "${spec}" leaves packages/${s.pkg}${into ? ` into ${into}/` : ""}; use the package name`);
        }
        continue;
      }
      const dep = packageOf(ctx, spec);
      if (dep === undefined || dep === s.pkg) continue;
      if (s.pkg === "ui") {
        if (dep !== "domain") bad(`@gt/ui imports @gt/${dep}; it may see @gt/domain only`);
      } else if (dep === "ui") {
        bad(`@gt/${s.pkg} imports @gt/ui; no layer reaches up into the UI`);
      } else {
        const to = LAYER_ORDER.indexOf(dep);
        if (layer >= 0 && to > layer) bad(`@gt/${s.pkg} imports higher layer @gt/${dep} (order ${LAYER_ORDER.join(" < ")})`);
      }
    }
  }
  return { check: "boundaries", walked: ctx.srcs.length, checked: ctx.srcs.length - skipped, skipped, violations };
}

function cycles(ctx: Ctx): Report {
  const edges = new Map<string, { to: string; line: number }[]>();
  for (const s of ctx.srcs) {
    const out: { to: string; line: number }[] = [];
    for (const imp of s.imports) {
      const to = resolveEdge(ctx, s, imp.spec);
      if (to !== undefined) out.push({ to, line: imp.line });
    }
    edges.set(s.rel, out);
  }
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const violations: Violation[] = [];
  let counter = 0;
  const strong = (v: string): void => {
    index.set(v, counter); low.set(v, counter); counter++;
    stack.push(v); onStack.add(v);
    for (const { to } of edges.get(v) ?? []) {
      if (!index.has(to)) { strong(to); low.set(v, Math.min(low.get(v) ?? 0, low.get(to) ?? 0)); }
      else if (onStack.has(to)) low.set(v, Math.min(low.get(v) ?? 0, index.get(to) ?? 0));
    }
    if (low.get(v) !== index.get(v)) return;
    const comp: string[] = [];
    for (;;) {
      const w = stack.pop();
      if (w === undefined) break;
      onStack.delete(w); comp.push(w);
      if (w === v) break;
    }
    const self = comp.length === 1 && (edges.get(v) ?? []).some((e) => e.to === v);
    if (comp.length < 2 && !self) return;
    const members = new Set(comp);
    for (const f of comp.sort()) {
      const e = (edges.get(f) ?? []).find((x) => members.has(x.to));
      violations.push({ file: f, line: e?.line ?? 1, message: `in an import cycle of ${comp.length}: ${comp.join(" -> ")}` });
    }
  };
  for (const s of ctx.srcs) if (!index.has(s.rel)) strong(s.rel);
  return { check: "cycles", walked: ctx.srcs.length, checked: ctx.srcs.length, skipped: 0, violations };
}

const isConsole = (st: ts.Statement): boolean => {
  if (!ts.isExpressionStatement(st) || !ts.isCallExpression(st.expression)) return false;
  const callee = st.expression.expression;
  return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "console";
};
const isBareReturn = (st: ts.Statement): boolean => ts.isReturnStatement(st) && st.expression === undefined;

function hygiene(ctx: Ctx): Report {
  const violations: Violation[] = [];
  for (const s of ctx.srcs) {
    const sf = s.sf;
    let keydownAllowance = s.rel === KEYMAP_DISPATCHER ? 1 : 0;
    const bad = (n: ts.Node, message: string): void => {
      violations.push({ file: s.rel, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, message });
    };
    const visit = (n: ts.Node): void => {
      if (ts.isAsExpression(n) && n.type.kind === ts.SyntaxKind.UnknownKeyword && ts.isAsExpression(n.parent)) bad(n, "`as unknown as` cast");
      if (n.kind === ts.SyntaxKind.AnyKeyword) bad(n, "`any` type annotation");
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const { expression: obj, name } = n.expression;
        if (ts.isIdentifier(obj) && obj.text === "JSON" && name.text === "parse" && s.rel !== DOOR) bad(n, `JSON.parse outside ${DOOR}`);
        const first = n.arguments[0];
        if (name.text === "addEventListener" && first !== undefined && ts.isStringLiteralLike(first) && first.text === "keydown") {
          if (keydownAllowance > 0) keydownAllowance--;
          else bad(n, `addEventListener("keydown") (keys go through the keymap registry; the one listener is ${KEYMAP_DISPATCHER})`);
        }
      }
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && /^(window|document|globalThis)$/.test(n.expression.text) && n.name.text.toLowerCase() === "onkeydown") {
        bad(n, `${n.expression.text}.${n.name.text} raw keydown handler`);
      }
      if (ts.isCatchClause(n)) {
        const sts = n.block.statements;
        if (sts.length === 0) bad(n, "swallowed catch (empty or comment-only)");
        else if (sts.every((st) => isConsole(st) || isBareReturn(st))) bad(n, "swallowed catch (console-only or bare return)");
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { check: "hygiene", walked: ctx.srcs.length, checked: ctx.srcs.length, skipped: ctx.skipped, violations };
}

function size(ctx: Ctx): Report {
  const violations = ctx.srcs
    .filter((s) => s.lines > MAX_LINES)
    .map((s) => ({ file: s.rel, line: MAX_LINES + 1, message: `${s.lines} lines; the cap is ${MAX_LINES}` }));
  return { check: "size", walked: ctx.srcs.length, checked: ctx.srcs.length, skipped: ctx.skipped, violations };
}

function main(): number {
  const { root, only } = parseArgs(process.argv.slice(2));
  const { dirs, names } = readPackages(root);
  const { srcs, skipped } = load(root, dirs);
  const ctx: Ctx = { root, names, srcs, skipped };
  const run: Record<CheckName, (c: Ctx) => Report> = { boundaries, cycles, hygiene, size };
  let total = 0;
  for (const name of only) {
    const r = run[name](ctx);
    console.log(`${r.check}: walked ${r.walked}, checked ${r.checked}, skipped ${r.skipped}, ${r.violations.length} violation(s)`);
    for (const v of r.violations) console.log(`  ${v.file}:${v.line}  ${v.message}`);
    total += r.violations.length;
  }
  console.log(total === 0 ? "next-structure: clean" : `next-structure: ${total} violation(s)`);
  return total === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (e) {
  if (e instanceof CouldNotRun) {
    console.error(`next-structure: could not run - ${e.message}`);
    process.exitCode = 2;
  } else {
    console.error(`next-structure: crashed - ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exitCode = 2;
  }
}
