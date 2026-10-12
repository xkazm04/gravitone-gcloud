// THE QUERY LAYER FOR SOURCE PROBES - ask the program, not the text.
//
// About a third of the specs in this directory prove a rule by reading source as
// TEXT: strip comments, `indexOf('case "Enter"')`, brace-match a function body,
// walk a directory somebody chose. comment-strip-ratchet exists because that has
// already blinded probes once. This module answers the same questions from the
// TypeScript compiler's own tree, so a comment can neither satisfy nor hide a
// match (a comment is trivia, it is not a node) and a population can be DERIVED
// (every call site of X) rather than listed.
//
// Every query returns resolved nodes, never strings. Paths are repo-relative with
// forward slashes, on every platform.
//
// ONE PROJECT PER PROCESS, PARSED ON DEMAND. The node lane runs serial in one
// process, so the file list is read from tsconfig once and each file is parsed
// the first time a query reaches it, then cached. This is deliberately NOT
// ts.createProgram: measured 2026-10-12 on this machine, a Program over the
// 1,014 product files took 16s (and over a minute under the Playwright runner)
// even with noResolve/noLib, against 2.5s to parse the same files directly -
// the Program does module-resolution and host bookkeeping no syntax query needs.
// The file list is the repo's own tsconfig `include`, narrowed to the directories
// that hold product source (SOURCE_ROOTS); the tsconfig also names generated
// `.next-*` type folders and the probes themselves, which no source probe queries.
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

const ROOT = process.cwd();

/** Directories a source probe may query. Everything else in tsconfig `include`
 *  (tests, pipeline scripts, generated `.next*` types) is left out. */
const SOURCE_ROOTS = ["app", "components", "lib"] as const;

const rel = (abs: string) => path.relative(ROOT, abs).split(path.sep).join("/");

let listed: string[] | undefined;
const parsedFiles = new Map<string, ts.SourceFile>();

/** Every product source file named by tsconfig.json, repo-relative. */
export function projectFiles(): readonly string[] {
  if (listed) return listed;
  const read = ts.readConfigFile(path.join(ROOT, "tsconfig.json"), ts.sys.readFile);
  if (read.error) {
    throw new Error(`_ast: cannot read tsconfig.json: ${ts.flattenDiagnosticMessageText(read.error.messageText, " ")}`);
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, ROOT);
  listed = parsed.fileNames
    .map(rel)
    .filter((r) => SOURCE_ROOTS.some((d) => r.startsWith(`${d}/`)) && !r.endsWith(".d.ts"))
    .sort();
  if (listed.length === 0) {
    throw new Error("_ast: tsconfig include yielded no source files - the root filter is reading the wrong tree");
  }
  return listed;
}

/** The parsed file (with parent pointers, so `getText()` works), cached. */
export function sourceFile(file: string): ts.SourceFile {
  let sf = parsedFiles.get(file);
  if (!sf) {
    if (!projectFiles().includes(file)) {
      throw new Error(`_ast: ${file} is not a product source file (roots: ${SOURCE_ROOTS.join(", ")})`);
    }
    const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    sf = ts.createSourceFile(file, readFileSync(path.join(ROOT, file), "utf8"), ts.ScriptTarget.ES2022, true, kind);
    parsedFiles.set(file, sf);
  }
  return sf;
}

/** Source files under `under` (default: every source root). `mentions` is a PREFILTER
 *  only: a file whose raw text never contains the string cannot contain a node that
 *  names it, so it is skipped unparsed. Matching is still done on nodes, never text. */
export function sourceFiles(under: readonly string[] = SOURCE_ROOTS, mentions?: string): ts.SourceFile[] {
  const prefixes = under.map((d) => `${d.replace(/\/$/, "")}/`);
  return projectFiles()
    .filter((f) => prefixes.some((p) => f.startsWith(p)))
    .filter((f) => !mentions || readFileSync(path.join(ROOT, f), "utf8").includes(mentions))
    .map(sourceFile);
}

export const fileOf = (n: ts.Node) => rel(n.getSourceFile().fileName);
export const lineOf = (n: ts.Node) => n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line + 1;

/** Visit `node` and every descendant. */
export function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (c) => walk(c, visit));
}

export type FnNode = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression;

/** The function named `name` in `file`: a declaration, a method, or a `const name =
 *  <arrow | function expression>`. Throws when absent or ambiguous - a probe whose
 *  subject has been renamed must go red, not vacuously green. */
export function fn(file: string, name: string): FnNode {
  return fnIn(sourceFile(file), name, file);
}

/** `fn` over an already-parsed tree (fixtures). */
export function fnIn(root: ts.Node, name: string, label = "tree"): FnNode {
  const hits: FnNode[] = [];
  walk(root, (n) => {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name?.getText() === name && n.body) {
      hits.push(n);
    } else if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer &&
      (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
    ) {
      hits.push(n.initializer);
    }
  });
  if (hits.length !== 1) throw new Error(`_ast: expected exactly one function "${name}" in ${label}, found ${hits.length}`);
  return hits[0];
}

/** Every `case <label>:` clause under `node`, across ALL switch statements in it.
 *  `label` matches a string-literal case expression by value. */
export function switchCase(node: ts.Node, label: string): ts.CaseClause[] {
  const out: ts.CaseClause[] = [];
  walk(node, (n) => {
    if (ts.isCaseClause(n) && ts.isStringLiteralLike(n.expression) && n.expression.text === label) out.push(n);
  });
  return out;
}

export interface Call {
  node: ts.CallExpression;
  file: string;
  line: number;
  /** The callee's final name: `addEventListener` for `window.addEventListener(...)`. */
  name: string;
  /** The first argument's value when it is a string literal, else undefined. */
  arg0?: string;
}

function calleeName(e: ts.LeftHandSideExpression): string | undefined {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return undefined;
}

const toCall = (node: ts.CallExpression, name: string): Call => ({
  node,
  file: fileOf(node),
  line: lineOf(node),
  name,
  arg0: node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : undefined,
});

/** Every call whose callee ends in `symbol`. `scope` is a node to search under, or
 *  a list of repo directories (default: every source root). A call written inside
 *  a comment is not a node, so cannot match. */
export function callsTo(symbol: string, scope?: ts.Node | readonly string[]): Call[] {
  const roots: readonly ts.Node[] =
    scope && !Array.isArray(scope) ? [scope as ts.Node] : sourceFiles(scope as readonly string[] | undefined, symbol);
  const out: Call[] = [];
  for (const r of roots) {
    walk(r, (n) => {
      if (ts.isCallExpression(n) && calleeName(n.expression) === symbol) out.push(toCall(n, symbol));
    });
  }
  return out;
}
