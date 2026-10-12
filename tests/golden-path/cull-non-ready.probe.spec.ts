// LANE — ONE STATE DERIVATION for the cull tile and the comparison.
//
// The tile knew a candidate was failed / queued / generating and printed the
// forge's error; the Lightbox hard-coded `ready` for everything not deleted, so a
// failed candidate opened to a wordless broken-file glyph with Keep/Reject on it,
// and K/X/U wrote verdicts onto candidates no tile shows.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { artStateOf } from "@/app/foundry/CullGrid";
import type { Candidate } from "@/lib/foundry/types";

import { stripComments } from "./_helpers";

const cand = (o: Partial<Candidate>) => o as Candidate;
const read = (f: string) => stripComments(readFileSync(resolve(__dirname, "../../app/foundry", f), "utf8"));

test("cull non-ready: one derivation names every state", () => {
  expect(artStateOf(cand({ status: "failed" }), false)).toBe("failed");
  expect(artStateOf(cand({ status: "pending" }), false)).toBe("queued");
  expect(artStateOf(cand({ status: "pending" }), true)).toBe("generating");
  expect(artStateOf(cand({ deleted: true, status: "graded" }), false)).toBe("deleted");
  expect(artStateOf(cand({ status: "graded" }), false)).toBe("ready");
  expect(artStateOf(cand({ status: "unmeasured" }), false)).toBe("ready");
  expect(artStateOf(undefined, false)).toBe("queued");
});

test("cull non-ready: the Lightbox uses it, prints the error, and gates verdicts", () => {
  const lb = read("Lightbox.tsx");
  expect(lb).toContain("artStateOf(");
  expect(lb).toContain("candidate.error");
  expect(lb).not.toContain(': "ready"}');
  // K/X/U and the footer controls only on a ready candidate.
  expect(lb).toMatch(/ready/);
  const keys = lb.slice(lb.indexOf("const onKey"), lb.indexOf("addEventListener"));
  expect(keys).toContain("canVerdict");
});

test("cull non-ready: the grid's K/X/U are guarded by readiness", () => {
  // The keys are declared once in cullKeymap and bound in CullGrid through useKeymap;
  // every verdict action must route through the one readiness-guarded handler.
  const cg = read("CullGrid.tsx");
  const guard = cg.slice(cg.indexOf("const verdictOf"), cg.indexOf("useKeymap("));
  expect(guard.length).toBeGreaterThan(0);
  expect(guard).toContain("artStateOf(");
  expect(guard).toContain("onVerdict(focused");
  const binds = cg.slice(cg.indexOf("keep:"), cg.indexOf("undo:"));
  for (const a of ["keep", "reject", "clear"]) expect(binds, `${a} is not behind verdictOf`).toContain(`${a}: verdictOf(`);
  // And no verdict is handed for the focused tile on a line that does not check readiness.
  const unguarded = cg.split(/\r?\n/).filter((l) => l.includes("onVerdict(focused") && !l.includes("artStateOf("));
  expect(unguarded).toEqual([]);
});
