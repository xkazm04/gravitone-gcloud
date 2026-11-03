// THE BAKE-OFF COMPARISON - one page, a column per stack, the same numbers in
// the same rows, so the choice is made by reading across. Each stack writes
// `bakeoff/<stack>/result.json` (StackResult); this module only reads them.
// A stack with no result is a cell that says so: an empty column that simply
// vanished would read as "two stacks were tried", which is a different fact.
//
// Revideo, if the bake-off builds it, reports under `remotion` (its lineage)
// with a note saying which it was; the stack names are the state machine's.
//
// The `stack:` pick ends here too (`finalizeStack`): the chosen stack's full
// render, resolved relative to its own stack folder, is copied to
// `<dir>/music-clip/final.mp4`. A stack with no full render cannot be chosen.

import fs from "node:fs";
import path from "node:path";

import { esc, page } from "./boardShell";
import { clipPath, clipRoot, readJsonFile } from "./folder";
import { ClipError, STACKS } from "./state";
import type { ClipStack } from "./types";

export interface EditRound {
  request: string;
  minutes: number;
  filesChanged: number;
  linesChanged: number;
  ok: boolean;
}

export interface StackResult {
  v: 1;
  stack: ClipStack;
  proofMp4?: string;
  fullMp4?: string;
  renderSeconds?: number;
  framesPerSecond?: number;
  editRound?: EditRound[];
  notes?: string;
}

export type StackCell = { stack: ClipStack; present: false } | { stack: ClipStack; present: true; result: StackResult } | { stack: ClipStack; present: true; error: string };

export function parseResult(raw: unknown, stack: ClipStack): StackResult | string {
  if (!raw || typeof raw !== "object") return "not an object";
  const o = raw as Record<string, unknown>;
  if (o["v"] !== 1) return "v is not 1";
  if (o["stack"] !== stack) return `stack is ${JSON.stringify(o["stack"])}, folder is ${stack}`;
  for (const k of ["proofMp4", "fullMp4", "notes"]) if (o[k] !== undefined && typeof o[k] !== "string") return `${k} is not a string`;
  for (const k of ["renderSeconds", "framesPerSecond"]) if (o[k] !== undefined && (typeof o[k] !== "number" || !Number.isFinite(o[k]))) return `${k} is not a number`;
  if (o["editRound"] !== undefined && !Array.isArray(o["editRound"])) return "editRound is not an array";
  return raw as StackResult;
}

export function readResults(dir: string): StackCell[] {
  return STACKS.map((stack): StackCell => {
    const p = clipPath(dir, "bakeoff", stack, "result.json");
    if (!fs.existsSync(p)) return { stack, present: false };
    try {
      const r = parseResult(readJsonFile(p, `${stack}/result.json`), stack);
      return typeof r === "string" ? { stack, present: true, error: r } : { stack, present: true, result: r };
    } catch (e) {
      return { stack, present: true, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

/** A result's video path as compare.html (in music-clip/) reaches it, forward slashes. */
export function videoHref(stack: ClipStack, file: string): string {
  const rel = path.isAbsolute(file) ? file : path.join("bakeoff", stack, file);
  return rel.split(path.sep).join("/");
}

const num = (x: number | undefined, unit: string, digits = 1) => (x === undefined ? "-" : `${x.toFixed(digits)} ${unit}`);

function cell(c: StackCell): string {
  if (!c.present) return `<section class="cell none"><h2>${c.stack}</h2><p class="dim">no result</p></section>`;
  if ("error" in c) return `<section class="cell none"><h2>${c.stack}</h2><p class="err">result.json: ${esc(c.error)}</p></section>`;
  const r = c.result;
  const vid = (f: string | undefined, label: string) => (f ? `<figure><video controls preload="metadata" src="${esc(videoHref(c.stack, f))}"></video><figcaption>${label}</figcaption></figure>` : `<figure class="novid"><figcaption>${label} -</figcaption></figure>`);
  const rounds = (r.editRound ?? [])
    .map((e) => `<tr><td>${esc(e.request)}</td><td>${e.minutes}</td><td>${e.filesChanged}</td><td>${e.linesChanged}</td><td class="${e.ok ? "ok" : "err"}">${e.ok ? "ok" : "failed"}</td></tr>`)
    .join("");
  return `<section class="cell" data-stack="${c.stack}"><h2>${c.stack}</h2>
${vid(r.proofMp4, "proof")}${vid(r.fullMp4, "full")}
<dl><dt>render</dt><dd>${num(r.renderSeconds, "s")}</dd><dt>speed</dt><dd>${num(r.framesPerSecond, "fps")}</dd><dt>edit rounds</dt><dd>${r.editRound ? `${r.editRound.filter((e) => e.ok).length}/${r.editRound.length} ok` : "-"}</dd></dl>
${rounds ? `<table><tr><th>request</th><th>min</th><th>files</th><th>lines</th><th></th></tr>${rounds}</table>` : ""}
${r.notes ? `<p class="notes">${esc(r.notes)}</p>` : ""}</section>`;
}

const CSS = `
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.cell{background:#16181d;border:1px solid #262930;border-radius:10px;padding:14px;display:grid;gap:10px;align-content:start}
.cell.none{opacity:.6}
.cell h2{font-size:20px}
video{width:100%;display:block;background:#000;border-radius:4px}
figcaption{font-size:12px;color:#9a978f}
dl{display:grid;grid-template-columns:100px 1fr;gap:4px 10px;font-family:ui-monospace,monospace;font-size:14px}dt{color:#9a978f}
table{border-collapse:collapse;font-size:13px;width:100%}td,th{border-bottom:1px solid #262930;padding:3px 6px;text-align:left}
.ok{color:#7fd18b}.err{color:#f06b6b}.notes{font-size:14px;white-space:pre-wrap}
`;

export function comparePage(title: string, cells: readonly StackCell[]): string {
  return page(`${title} - bake-off`, CSS, `<h1 style="font-size:24px;margin-bottom:18px">${esc(title)}</h1><main class="grid">${cells.map(cell).join("\n")}</main>`).replace(
    // compare.html plays local videos; the board CSP's media-src would refuse file: URLs.
    /media-src data: blob:/,
    "media-src 'self' file: data: blob:",
  );
}

export function runCompare(dir: string, title: string): { html: string; stacks: { stack: ClipStack; present: boolean; error?: string }[] } {
  const cells = readResults(dir);
  const html = clipPath(dir, "compare.html");
  fs.mkdirSync(clipRoot(dir), { recursive: true });
  fs.writeFileSync(html, comparePage(title, cells));
  return { html, stacks: cells.map((c) => ({ stack: c.stack, present: c.present, ...("error" in c ? { error: c.error } : {}) })) };
}

/** Copy the chosen stack's full render to final.mp4; refuses when it has none. */
export function finalizeStack(dir: string, stack: ClipStack): string {
  const c = readResults(dir).find((x) => x.stack === stack);
  if (!c || !c.present) throw new ClipError(`no bakeoff/${stack}/result.json; that stack has no result to pick`, "missing");
  if ("error" in c) throw new ClipError(`bakeoff/${stack}/result.json: ${c.error}`, "invalid");
  if (!c.result.fullMp4) throw new ClipError(`bakeoff/${stack}/result.json has no fullMp4; render the full clip before picking ${stack}`, "missing");
  const src = path.resolve(clipPath(dir, "bakeoff", stack), c.result.fullMp4);
  if (!fs.existsSync(src)) throw new ClipError(`${stack}'s fullMp4 does not exist: ${src}`, "missing");
  const dst = clipPath(dir, "final.mp4");
  fs.copyFileSync(src, dst);
  return dst;
}
