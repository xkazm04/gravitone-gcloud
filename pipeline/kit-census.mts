// THE KIT CENSUS — which kit part each file of the app uses, which parts nobody
// uses, and where hand-rolled copies of kit shapes live. Measured, never typed.
//
// Run:  npx tsx pipeline/kit-census.mts            rewrite app/kit/census.json
//       npx tsx pipeline/kit-census.mts --check    recompute, diff, exit 1 on drift
//       npx tsx pipeline/kit-census.mts --raise    rewrite even where suspects rose
//       (npm run check:kit-census is the --check form)
//
// WHY. /kit's Migration tab rested on a hand measurement taken 2026-09-29 (the
// file counts and an "evidence" column in app/kit/migrationMap.ts). Recounted on
// 2026-10-05 it had rotted the way every derived-by-hand list rots: Cut 1 file →
// 18, Playground 2 → 35, Library 23 → 40, and the gap list read empty while Cut,
// Playground and Score imported nothing from the kit. A catalog with no
// recomputation path is stale by construction (registry: ui-controls,
// control-inventory-and-discovery), so this file is the recomputation path and
// tests/golden-path/kit-catalog.probe.spec.ts recomputes it in-process on every
// `npm test`.
//
// WHAT IS MEASURED. The population is `git ls-files -- app components`, .ts/.tsx
// only: what is tracked, so an untracked scratch file in someone's checkout
// cannot make the committed census disagree with CI. Every file is parsed with
// the repo's own `typescript` (syntax only, no Program: no type is needed to
// follow an import, and a parse of ~460 files costs well under a second).
//
//   parts     every value export of the SURFACES below, resolved through barrels
//             to its defining file, with the files that import AND reference it.
//             Two exports with one name but different definitions are two parts;
//             the later one is spelled `<surface>#<Name>`.
//   modules   per directory (see moduleOf): source files, files importing the
//             kit, files importing the signal vocabulary, parts used, and the
//             hand-rolled suspects below.
//   zeroAdopters  parts no file outside the kit renders.
//
// THE KIT ZONE adopts nothing: components/kit, components/ui/signal (where the
// parts live and re-export each other) and app/kit (the specimen sheet renders
// every part by design). Counting them would make every part look adopted.
//
// SUSPECTS are heuristics, and heuristics have false positives, so they RATCHET:
// a module's count may fall freely and is recorded at whatever it is on first
// sight, but a rise against the committed census fails `--check` and the probe,
// and a rewrite refuses it without `--raise` (registry: quality-gates, an excess
// indicts the instrument before the code). Not counted in the kit zone, nor in a
// file that is a part's own home (components/ui/Field.tsx IS the select).
//
//   tab     an intrinsic element with role="tab" in a file that does not use TabRail
//   select  an intrinsic <select>
//   media   an intrinsic <audio> or <video>
//   title   a native title= attribute on an intrinsic element
//   typing  a private typing guard: a read of `.isContentEditable`

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

export const CENSUS_FILE = "app/kit/census.json";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WALKED = ["app", "components"];

/** Where a part can be imported from. Order decides which of two same-named exports keeps the bare name. */
export const SURFACES = [
  "components/kit/index.ts",
  "components/kit/brand/index.ts",
  "components/ui/signal/index.ts",
  "components/ui/Primitives.tsx",
  "components/ui/Field.tsx",
  "components/ui/Modal.tsx",
  "components/ui/Select.tsx",
] as const;

const KIT_ZONE = ["components/kit/", "components/ui/signal/", "app/kit/"];

/** Directories whose children are each a module. Longest first. */
const CONTAINERS = ["app/_phases", "components/ui", "app", "components"];

export const SUSPECT_KINDS = ["tab", "select", "media", "title", "typing"] as const;
export type SuspectKind = (typeof SUSPECT_KINDS)[number];
export type Suspects = Record<SuspectKind, number>;

export interface CensusPart {
  /** The file that defines it. */
  home: string;
  /** The barrels and modules it can be imported from. */
  surfaces: string[];
  /** Files outside the kit zone that import and reference it. */
  adopters: string[];
}

export interface CensusModule {
  files: number;
  /** Files importing from components/kit. */
  kitImports: number;
  /** Files importing from components/ui/signal. */
  signalImports: number;
  /** Parts any file of the module uses. */
  parts: string[];
  suspects: Suspects;
  /** Per file, the suspect kinds it holds (non-zero only). */
  suspectFiles: Record<string, Partial<Suspects>>;
}

export interface Census {
  $generated: string;
  files: number;
  parts: Record<string, CensusPart>;
  modules: Record<string, CensusModule>;
  zeroAdopters: string[];
}

const GENERATED =
  "pipeline/kit-census.mts — do not edit. `npx tsx pipeline/kit-census.mts` rewrites it; `--check` diffs it against the tree.";

// ── per-file facts (syntax only, cached by text) ────────────────────────────

interface Binding {
  /** The exported name it reads: a name, "default", or "*" for a namespace. */
  imported: string;
  local: string;
}
interface ImportDecl {
  spec: string;
  bindings: Binding[];
}
type ExportEntry = { local: string } | { from: string; name: string };

interface FileFacts {
  imports: ImportDecl[];
  /** Identifiers read outside import/export declarations, plus `ns.Name` for namespace reads. */
  refs: Set<string>;
  exports: Map<string, ExportEntry>;
  stars: string[];
  raw: Suspects;
}

const zero = (): Suspects => ({ tab: 0, select: 0, media: 0, title: 0, typing: 0 });

const hasModifier = (n: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === kind);

function factsOf(path: string, text: string): FileFacts {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const facts: FileFacts = { imports: [], refs: new Set(), exports: new Map(), stars: [], raw: zero() };

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const clause = st.importClause;
      if (!clause || clause.isTypeOnly || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const bindings: Binding[] = [];
      if (clause.name) bindings.push({ imported: "default", local: clause.name.text });
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) bindings.push({ imported: "*", local: nb.name.text });
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          if (el.isTypeOnly) continue;
          bindings.push({ imported: (el.propertyName ?? el.name).text, local: el.name.text });
        }
      }
      if (bindings.length) facts.imports.push({ spec: st.moduleSpecifier.text, bindings });
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue;
      const from = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      const clause = st.exportClause;
      if (!clause) {
        if (from) facts.stars.push(from);
      } else if (ts.isNamedExports(clause)) {
        for (const el of clause.elements) {
          if (el.isTypeOnly) continue;
          const source = (el.propertyName ?? el.name).text;
          facts.exports.set(el.name.text, from ? { from, name: source } : { local: source });
        }
      }
      continue;
    }
    if (ts.isExportAssignment(st) && !st.isExportEquals) {
      facts.exports.set("default", { local: ts.isIdentifier(st.expression) ? st.expression.text : "default" });
      continue;
    }
    if (!hasModifier(st, ts.SyntaxKind.ExportKeyword)) continue;
    const isDefault = hasModifier(st, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) {
      const name = st.name?.text ?? "default";
      facts.exports.set(isDefault ? "default" : name, { local: name });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) facts.exports.set(d.name.text, { local: d.name.text });
      }
    }
  }

  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isIdentifier(n)) facts.refs.add(n.text);
    if (ts.isPropertyAccessExpression(n)) {
      if (ts.isIdentifier(n.expression)) facts.refs.add(`${n.expression.text}.${n.name.text}`);
      if (n.name.text === "isContentEditable") facts.raw.typing++;
    }
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = ts.isIdentifier(n.tagName) ? n.tagName.text : "";
      if (/^[a-z]/.test(tag)) {
        if (tag === "select") facts.raw.select++;
        if (tag === "audio" || tag === "video") facts.raw.media++;
        for (const a of n.attributes.properties) {
          if (!ts.isJsxAttribute(a)) continue;
          const name = a.name.getText(sf);
          if (name === "title") facts.raw.title++;
          if (name === "role" && a.initializer && ts.isStringLiteral(a.initializer) && a.initializer.text === "tab") facts.raw.tab++;
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return facts;
}

const cache = new Map<string, { text: string; facts: FileFacts }>();

// ── the walk ────────────────────────────────────────────────────────────────

/** The module a file belongs to: the first directory below a container, or the container for its own files. */
export function moduleOf(path: string): string {
  for (const c of CONTAINERS) {
    if (!path.startsWith(`${c}/`)) continue;
    const rest = path.slice(c.length + 1);
    return rest.includes("/") ? `${c}/${rest.split("/")[0]}` : c;
  }
  return posix.dirname(path);
}

const inKitZone = (p: string) => KIT_ZONE.some((z) => p.startsWith(z));

export interface CensusOptions {
  root?: string;
  /** Path → source to add or replace; `null` removes a tracked file. For probes. */
  overlay?: Record<string, string | null>;
}

export function computeCensus(opts: CensusOptions = {}): Census {
  const root = opts.root ?? ROOT;
  const overlay = opts.overlay ?? {};
  const tracked = execFileSync("git", ["ls-files", "-z", "--", ...WALKED], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".d.ts"));
  const paths = new Set(tracked.filter((f) => overlay[f] !== null && (f in overlay || existsSync(resolve(root, f)))));
  for (const [f, src] of Object.entries(overlay)) if (src !== null) paths.add(f);
  if (paths.size === 0) throw new Error("kit census: the walk read no files (is this a git checkout?)");

  // One read per file per census; the parse is reused across censuses while the text is unchanged.
  const local = new Map<string, FileFacts>();
  const facts = (p: string): FileFacts => {
    const seen = local.get(p);
    if (seen) return seen;
    const text = overlay[p] ?? readFileSync(resolve(root, p), "utf8");
    const hit = cache.get(p);
    const f = hit && hit.text === text ? hit.facts : factsOf(p, text);
    cache.set(p, { text, facts: f });
    local.set(p, f);
    return f;
  };

  const resolveSpec = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), spec));
    else return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (paths.has(c)) return c;
    return null;
  };

  /** The definition an export of `file` names, as `<file>#<local>`, following re-exports. */
  const resolveExport = (file: string, name: string, depth = 0): string | null => {
    if (depth > 12 || name === "*") return null;
    const f = facts(file);
    const e = f.exports.get(name);
    if (e && "from" in e) {
      const target = resolveSpec(file, e.from);
      return target ? resolveExport(target, e.name, depth + 1) : null;
    }
    if (e) {
      const via = f.imports.find((i) => i.bindings.some((b) => b.local === e.local));
      if (via) {
        const b = via.bindings.find((x) => x.local === e.local)!;
        const target = resolveSpec(file, via.spec);
        return target ? resolveExport(target, b.imported, depth + 1) : null;
      }
      return `${file}#${e.local}`;
    }
    for (const s of f.stars) {
      const target = resolveSpec(file, s);
      const r = target ? resolveExport(target, name, depth + 1) : null;
      if (r) return r;
    }
    return null;
  };

  // The parts, from the surfaces.
  const parts = new Map<string, CensusPart>();
  const idOf = new Map<string, string>();
  for (const surface of SURFACES) {
    if (!paths.has(surface)) throw new Error(`kit census: surface ${surface} is not in the walk`);
    for (const name of facts(surface).exports.keys()) {
      const def = resolveExport(surface, name);
      if (!def) continue;
      const known = idOf.get(def);
      if (known) {
        const p = parts.get(known)!;
        if (!p.surfaces.includes(surface)) p.surfaces.push(surface);
        continue;
      }
      const display = name === "default" ? posix.basename(surface).replace(/\.tsx?$/, "") : name;
      const id = parts.has(display) ? `${surface.replace(/\.tsx?$/, "")}#${display}` : display;
      parts.set(id, { home: def.slice(0, def.lastIndexOf("#")), surfaces: [surface], adopters: [] });
      idOf.set(def, id);
    }
  }
  const homes = new Set([...parts.values()].map((p) => p.home));

  // Every file: which parts it uses, which barrels it reaches, what it hand-rolls.
  const modules = new Map<string, CensusModule & { partSet: Set<string> }>();
  for (const p of [...paths].sort()) {
    const f = facts(p);
    const used = new Set<string>();
    let kit = false;
    let signal = false;
    for (const imp of f.imports) {
      const target = resolveSpec(p, imp.spec);
      if (!target) continue;
      if (target.startsWith("components/kit/")) kit = true;
      if (target.startsWith("components/ui/signal/")) signal = true;
      for (const b of imp.bindings) {
        if (b.imported === "*") {
          for (const r of f.refs) {
            if (!r.startsWith(`${b.local}.`)) continue;
            const def = resolveExport(target, r.slice(b.local.length + 1));
            const id = def && idOf.get(def);
            if (id) used.add(id);
          }
          continue;
        }
        if (!f.refs.has(b.local)) continue;
        const def = resolveExport(target, b.imported);
        const id = def && idOf.get(def);
        if (id) used.add(id);
      }
    }

    const key = moduleOf(p);
    let m = modules.get(key);
    if (!m) {
      m = { files: 0, kitImports: 0, signalImports: 0, parts: [], partSet: new Set(), suspects: zero(), suspectFiles: {} };
      modules.set(key, m);
    }
    m.files++;
    if (kit) m.kitImports++;
    if (signal) m.signalImports++;
    for (const id of used) m.partSet.add(id);

    const zone = inKitZone(p);
    if (!zone) for (const id of used) parts.get(id)!.adopters.push(p);
    if (zone || homes.has(p)) continue;
    const s: Suspects = { ...f.raw, tab: used.has("TabRail") ? 0 : f.raw.tab };
    const nonzero: Partial<Suspects> = {};
    for (const k of SUSPECT_KINDS) {
      if (!s[k]) continue;
      m.suspects[k] += s[k];
      nonzero[k] = s[k];
    }
    if (Object.keys(nonzero).length) m.suspectFiles[p] = nonzero;
  }

  const partsOut: Record<string, CensusPart> = {};
  for (const id of [...parts.keys()].sort()) {
    const p = parts.get(id)!;
    partsOut[id] = { home: p.home, surfaces: p.surfaces, adopters: [...p.adopters].sort() };
  }
  const modulesOut: Record<string, CensusModule> = {};
  for (const key of [...modules.keys()].sort()) {
    const { partSet, ...m } = modules.get(key)!;
    modulesOut[key] = { ...m, parts: [...partSet].sort() };
  }
  return {
    $generated: GENERATED,
    files: paths.size,
    parts: partsOut,
    modules: modulesOut,
    zeroAdopters: Object.keys(partsOut).filter((id) => partsOut[id].adopters.length === 0),
  };
}

// ── comparison ──────────────────────────────────────────────────────────────

function listDelta(before: readonly string[], after: readonly string[]): string | null {
  const a = new Set(before);
  const b = new Set(after);
  const out = [...[...b].filter((x) => !a.has(x)).map((x) => `+${x}`), ...[...a].filter((x) => !b.has(x)).map((x) => `-${x}`)];
  return out.length ? out.join(" ") : null;
}

/** Every field where the committed census and the tree disagree, each naming its module or part and field. */
export function diffCensus(committed: Census, fresh: Census): string[] {
  const out: string[] = [];
  if (committed.files !== fresh.files) out.push(`files: census.json ${committed.files}, tree ${fresh.files}`);

  const mods = [...new Set([...Object.keys(committed.modules ?? {}), ...Object.keys(fresh.modules)])].sort();
  for (const k of mods) {
    const a = committed.modules?.[k];
    const b = fresh.modules[k];
    const at = `modules["${k}"]`;
    if (!a) { out.push(`${at}: in the tree, not in census.json`); continue; }
    if (!b) { out.push(`${at}: in census.json, not in the tree`); continue; }
    for (const field of ["files", "kitImports", "signalImports"] as const) {
      if (a[field] !== b[field]) out.push(`${at}.${field}: census.json ${a[field]}, tree ${b[field]}`);
    }
    const parts = listDelta(a.parts ?? [], b.parts);
    if (parts) out.push(`${at}.parts: ${parts}`);
    for (const kind of SUSPECT_KINDS) {
      if ((a.suspects?.[kind] ?? 0) !== b.suspects[kind]) out.push(`${at}.suspects.${kind}: census.json ${a.suspects?.[kind] ?? 0}, tree ${b.suspects[kind]}`);
    }
    const files = [...new Set([...Object.keys(a.suspectFiles ?? {}), ...Object.keys(b.suspectFiles)])].sort();
    for (const f of files) {
      const x = JSON.stringify(a.suspectFiles?.[f] ?? {});
      const y = JSON.stringify(b.suspectFiles[f] ?? {});
      if (x !== y) out.push(`${at}.suspectFiles["${f}"]: census.json ${x}, tree ${y}`);
    }
  }

  const ids = [...new Set([...Object.keys(committed.parts ?? {}), ...Object.keys(fresh.parts)])].sort();
  for (const id of ids) {
    const a = committed.parts?.[id];
    const b = fresh.parts[id];
    const at = `parts["${id}"]`;
    if (!a) { out.push(`${at}: exported, not in census.json`); continue; }
    if (!b) { out.push(`${at}: in census.json, no longer exported`); continue; }
    if (a.home !== b.home) out.push(`${at}.home: census.json ${a.home}, tree ${b.home}`);
    const surfaces = listDelta(a.surfaces ?? [], b.surfaces);
    if (surfaces) out.push(`${at}.surfaces: ${surfaces}`);
    const adopters = listDelta(a.adopters ?? [], b.adopters);
    if (adopters) out.push(`${at}.adopters: ${adopters}`);
  }

  const zeros = listDelta(committed.zeroAdopters ?? [], fresh.zeroAdopters);
  if (zeros) out.push(`zeroAdopters: ${zeros}`);
  return out;
}

/** Suspect counts that rose in a module the committed census already knew. A module or kind seen first is its own baseline. */
export function ratchetBreaches(committed: Census, fresh: Census): string[] {
  const out: string[] = [];
  for (const [k, b] of Object.entries(fresh.modules)) {
    const a = committed.modules?.[k];
    if (!a?.suspects) continue;
    for (const kind of SUSPECT_KINDS) {
      const before = a.suspects[kind];
      if (typeof before === "number" && b.suspects[kind] > before) {
        out.push(`modules["${k}"].suspects.${kind} rose ${before} → ${b.suspects[kind]}: ${Object.keys(b.suspectFiles).filter((f) => b.suspectFiles[f][kind]).join(", ")}`);
      }
    }
  }
  return out;
}

export const serializeCensus = (c: Census) => `${JSON.stringify(c, null, 2)}\n`;

// ── CLI ─────────────────────────────────────────────────────────────────────

function main(argv: string[]): number {
  const fresh = computeCensus();
  const file = resolve(ROOT, CENSUS_FILE);
  const committed: Census | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  const summary = `${fresh.files} files · ${Object.keys(fresh.modules).length} modules · ${Object.keys(fresh.parts).length} parts · ${fresh.zeroAdopters.length} with no adopter`;

  if (argv.includes("--check")) {
    if (!committed) {
      console.error(`${CENSUS_FILE} is missing. Run: npx tsx pipeline/kit-census.mts`);
      return 1;
    }
    const breaches = ratchetBreaches(committed, fresh);
    const stale = diffCensus(committed, fresh);
    for (const b of breaches) console.error(`RATCHET  ${b}`);
    for (const s of stale) console.error(`STALE    ${s}`);
    if (breaches.length || stale.length) {
      console.error(`\n${breaches.length} ratchet breach(es), ${stale.length} stale field(s).`);
      if (breaches.length) console.error("A rise is a hand-rolled copy of a kit shape: use the part, or record the rise with --raise.");
      if (stale.length) console.error("Rewrite the census: npx tsx pipeline/kit-census.mts");
      return 1;
    }
    console.log(`kit census current: ${summary}`);
    return 0;
  }

  const breaches = committed ? ratchetBreaches(committed, fresh) : [];
  if (breaches.length && !argv.includes("--raise")) {
    for (const b of breaches) console.error(`RATCHET  ${b}`);
    console.error("\nNot written: suspects rose. Use the kit part, or rerun with --raise to record the rise.");
    return 1;
  }
  writeFileSync(file, serializeCensus(fresh));
  console.log(`wrote ${CENSUS_FILE}: ${summary}`);
  if (breaches.length) console.log(`recorded ${breaches.length} raised suspect count(s) (--raise)`);
  return 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exit(main(process.argv.slice(2)));
}
