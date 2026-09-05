// LANE — ONE COMMIT RULE, TWO IMPLEMENTATIONS, AND THE CLIENT MUST NOT BE THE
// LOOSER OR THE TIGHTER OF THE TWO (dynamic).
//
// Which run statuses may be committed is decided on the server: `commitRun` in
// lib/foundry/store.ts answers 409 for anything outside its set, and
// `commitExtractRun` in lib/foundry/extract/store.ts has its own, narrower one.
// The page then states the SAME rule a second time, as a `disabled` on a
// button — and a disabled button is not a weaker copy of a 409, it is the only
// copy the user ever meets.
//
// Measured 2026-09-05: the forge's server accepted `done` AND `failed`; the
// forge's button accepted `done` only. A run that died partway — the ordinary
// outcome of an evening on one card — is marked `failed` with every plate it
// did generate still on disk, and those plates could not be culled from the
// page at all. The Extract tab's button, written later, mirrored ITS server
// rule exactly. One rule, two implementations, and only one of them had been
// kept true.
//
// So this probe does not hold a list. It reads each commit function's OWN guard
// off disk and asserts the client constant equals it — the ground truth is the
// server, and a test that restated the set by hand would just be a third copy
// to drift. Change either side alone and this goes red naming both.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { COMMITTABLE, EXTRACT_COMMITTABLE } from "@/app/foundry/parts";

/** Source with comments removed, so prose about the rule cannot satisfy it —
 *  these very files explain the rule directly above the code that implements
 *  it, and the first cut of a sibling probe passed on the comment alone. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function read(rel: string): string {
  return code(readFileSync(join(process.cwd(), rel), "utf8"));
}

/** The body of one exported async function, brace-matched from its signature. */
function bodyOf(src: string, name: string): string {
  const at = src.indexOf(`export async function ${name}(`);
  expect(at, `${name} was not found — this probe is reading the wrong file`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`${name}'s body is unbalanced`);
}

/** The statuses a commit guard LETS THROUGH, read off the guard itself.
 *
 *  Two shapes are in use and both are legitimate, so both are recognised: an
 *  allow-list (`!["done","failed"].includes(run.status)` throws) and a single
 *  equality (`run.status !== "done"` throws). Anything else is not a shape this
 *  probe can read, and that is a HARD FAILURE rather than an empty set — a
 *  parser that silently understood nothing would report perfect agreement. */
function serverAllows(body: string, fn: string): string[] {
  const list = body.match(/!\s*\[([^\]]+)\]\s*\.includes\(\s*run\.status\s*\)/);
  if (list) return [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  const eq = body.match(/run\.status\s*!==\s*"([^"]+)"/);
  if (eq) return [eq[1]];
  throw new Error(
    `${fn}'s status guard is in a shape this probe cannot read. It was one of ` +
      `!["a","b"].includes(run.status) or run.status !== "a". Teach the probe the new ` +
      `shape — do not delete the assertion, the client copy still has to match.`,
  );
}

test("the forge's Commit button allows exactly what commitRun allows", () => {
  const body = bodyOf(read("lib/foundry/store.ts"), "commitRun");
  const server = serverAllows(body, "commitRun");
  console.log(`[commit-gate] forge server=${JSON.stringify(server)} client=${JSON.stringify([...COMMITTABLE].sort())}`);

  // `failed` is the member this probe was written for: a run that died partway
  // still has plates on disk, and they are reachable only through this button.
  expect(server, "commitRun no longer allows a failed run — was that deliberate?").toContain("failed");
  expect([...COMMITTABLE].sort()).toEqual(server);
});

test("the Extract tab's Commit button allows exactly what commitExtractRun allows", () => {
  const body = bodyOf(read("lib/foundry/extract/store.ts"), "commitExtractRun");
  const server = serverAllows(body, "commitExtractRun");
  console.log(`[commit-gate] extract server=${JSON.stringify(server)} client=${JSON.stringify([...EXTRACT_COMMITTABLE].sort())}`);

  // Narrower than the forge's ON PURPOSE — a failed extraction has no partial
  // artefact worth ratifying — so the two sets differing is not the finding.
  // Either one differing from ITS OWN server is.
  expect([...EXTRACT_COMMITTABLE].sort()).toEqual(server);
});

test("neither view states a commit status inline any more", () => {
  // The constants only hold if the views actually read them. A reintroduced
  // `run.status !== "done"` beside the Commit button is the exact regression,
  // and it would leave both assertions above green.
  for (const rel of ["app/foundry/FoundryView.tsx", "app/foundry/ExtractView.tsx"]) {
    const src = read(rel);
    expect(src.length, `${rel} read as empty — the probe is reading the wrong tree`).toBeGreaterThan(1000);
    expect(src.includes("setConfirm(true)"), `${rel} no longer has the commit control this pins`).toBe(true);
    const inline = [...src.matchAll(/run\.status\s*!==\s*"(done|failed)"/g)].map((m) => m[0]);
    expect(inline, `${rel} compares run.status inline again — use COMMITTABLE / EXTRACT_COMMITTABLE`).toEqual([]);
  }
});
