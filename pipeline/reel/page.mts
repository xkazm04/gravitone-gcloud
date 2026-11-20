// THE PAGE, PREPARED AND LINTED. The author writes code and two kinds of EMPTY block; this file fills them and
// holds the result to what was issued.
//
//   <script id="strip-data" type="application/json">{}</script>   the table and its timing plan
//   <script id="vendor-three"></script>                            three.js, when the form is 3D
//
// THE AUTHOR NEVER TYPES A NUMBER, and never pastes a library: the issued block is hundreds of kilobytes and
// three.js is 600, so neither can be typed by a model without being cut or altered on the way. A page with no
// block, or more than one, is left alone for the lint to name.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { formatLint, lintStrip, stripDataEquals, stripDataRule } from "../../lib/foundry/strips/lint";
import type { computeTimingPlan } from "../../lib/reel/timing";
import type { ReelTable } from "../../lib/reel/types";

export const DATA_ID = "strip-data";
const VENDOR_DIR = path.join(import.meta.dirname, "..", "strips", "vendor");
/** Block id -> the vendored file that fills it (pipeline/strips/vendor/README.md has versions and licences). */
export const VENDOR: Readonly<Record<string, string>> = { "vendor-three": "three.min.js" };

export interface Block {
  readonly table: ReelTable;
  readonly plan: ReturnType<typeof computeTimingPlan>;
}

const blockRe = (id: string): RegExp => new RegExp(`(<script\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>)([\\s\\S]*?)(</script>)`, "gi");

/** Replace the body of the one block with this id; the page unchanged when there is none or several. */
function fill(html: string, id: string, body: string): string {
  if ([...html.matchAll(blockRe(id))].length !== 1) return html;
  return html.replace(blockRe(id), (_m, open: string, _old: string, close: string) => `${open}${body}${close}`);
}

const vendorText = async (file: string): Promise<string> =>
  // A library's own text must not close the script element it is inlined in.
  (await readFile(path.join(VENDOR_DIR, file), "utf8")).replace(/<\/script/gi, "<\\/script");

/** The authored page with its data block and any vendor block filled. */
export async function prepare(html: string, block: Block): Promise<string> {
  // "<" is escaped so no value can close the script element early.
  let out = fill(html, DATA_ID, JSON.stringify(block).replace(/</g, "\\u003c"));
  for (const [id, file] of Object.entries(VENDOR)) {
    if (blockRe(id).test(out)) out = fill(out, id, await vendorText(file));
  }
  return out;
}

/**
 * Every finding against a prepared page, as lines. The frame-purity lint reads the AUTHOR's code only: a
 * vendored library names clocks and schedulers it never runs under this contract (three.js has
 * requestAnimationFrame and performance.now in it), so a vendor block is first proven to be the pinned file,
 * byte for byte, and then left out of the reading.
 */
export async function lintPage(html: string, block: Block, frames: number): Promise<string[]> {
  const findings: string[] = [];
  let authored = html;
  for (const [id, file] of Object.entries(VENDOR)) {
    const found = [...html.matchAll(blockRe(id))];
    if (found.length === 0) continue;
    if (found.length > 1) {
      findings.push(`vendor: more than one <script id="${id}"> block`);
      continue;
    }
    if ((found[0]?.[2] ?? "") !== (await vendorText(file))) findings.push(`vendor: the ${id} block is not pipeline/strips/vendor/${file}, unchanged`);
    authored = fill(authored, id, "");
  }
  return [...findings, ...formatLint([...lintStrip(authored, { frames }), ...stripDataRule(authored, DATA_ID), ...stripDataEquals(authored, block, DATA_ID)])];
}

/** The block cut down to a few rows: the shape an author reads, small enough to read. Never rendered. */
export function sampleOf(block: Block): unknown {
  const P = 4;
  const { table, plan } = block;
  return {
    note: `SHAPE ONLY: ${table.periods.length} periods, ${table.entities.length} entities, ${table.events.length} events, ${plan.knots.length} knots in the real block. The CLI injects the real one.`,
    table: { ...table, periods: table.periods.slice(0, P), entities: table.entities.slice(0, 3).map((e) => ({ ...e, values: e.values.slice(0, P) })), events: table.events.slice(0, 2) },
    plan: { ...plan, knots: plan.knots.slice(0, P), orders: plan.orders.slice(0, P), events: plan.events.slice(0, 2) },
  };
}
