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
  const cg = read("CullGrid.tsx");
  const sw = cg.slice(cg.indexOf('case "k"'), cg.indexOf('case "Enter"'));
  expect(sw.length).toBeGreaterThan(0);
  expect(sw).toContain("artStateOf(");
  const calls = sw.split(/\r?\n/).filter((l) => l.includes("onVerdict(focused"));
  expect(calls.length).toBe(3);
  for (const l of calls) expect(l, "unguarded verdict key").toContain("artStateOf(");
});
