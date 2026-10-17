// LANE — THE C1 CLOSING STAGE (critic-2026-10-07-script-chain, Part 1), the cases
// that are not Frames (those are in frames-notebook.probe.spec.ts) and not the
// widened ratchet (notebook-source.probe.spec.ts).
//
// Driven over the notebook fixtures in tests/golden-path/_c1-harness.ts. The cases that read the v1 studio's Script
// and Research surfaces (ScriptStep's skeleton gate, the matrix readers, the
// dispatch strip, ScopeBar's StaleBadge, the useActiveNotebook hook) retired with
// them in Phase 4 wave D; the pure halves they rested on stay pinned here. Phase 6
// wave C retired two more with the code they drove: case 9 (the v1 Board's triage
// adapter, lib/board/sources/triage.ts - the new Board's research packet is
// lib/decision/v1, held by tests/next-server/decision-v1-*) and case 13 (the v1
// active-notebook reader, lib/notebook/active.ts, which only v1 surfaces called).
// Cases 8 and 11 now build the reasoned source directly instead of reading it back.
import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { buildCards } from "@/lib/notebook/cards";
import { fixtureSource, sourceOf } from "@/lib/notebook/source";
import { CONCLUSIONS } from "@/lib/notebook/conclusions";
import { RENDERS } from "@/lib/script/renders";
import { assembleRecalibrate } from "@/lib/turns/assemble/recalibrate";
import { CANNED, resultFor } from "@/lib/research/followup";
import { optInIds } from "@/lib/research/scope";
import { recalibrate } from "@/lib/script/recalibrate";
import { outWord } from "@/lib/script/scopeConflicts";
import { BASELINE, type Note } from "@/lib/script/versions";

import { stripComments } from "./_helpers";
import { liveNotebook, OWN_CONCLUSION, RECEIPT } from "./_c1-harness";

const code = (rel: string) => stripComments(readFileSync(path.join(process.cwd(), rel), "utf8"));

/** The reasoned source a landed live run is dealt as (what lib/notebook/active.ts read back). */
const reasoned = () => sourceOf(liveNotebook(), { kind: "reasoned", receipt: RECEIPT });

/* ───────────────────────── case 8: Step 2 reads the source's opt-in ──────────── */

test("case 8: an undecided live conclusion is not-taken in Step 2, and the recalibrate guard treats it as out", async () => {
  const src = reasoned();
  const cards = buildCards(src);
  const optIn = optInIds(src);
  const card = cards.find((c) => c.id === OWN_CONCLUSION.id)!;
  expect(card.optIn).toBe(true);

  // The default, which is the fixture's, reads the live conclusion as IN.
  expect(outWord(card, {})).toBe("in");
  expect(outWord(card, {}, optIn)).toBe("not-taken");

  const notes: Note[] = [{ id: "n1", cardId: card.id, kind: "more-focus", at: 1 }];
  const v = recalibrate(BASELINE, notes, "v2", 1, { cards, scope: {}, optIn });
  expect(v.refusals.map((r) => r.cardId), "the guard let a note fund a card the board never took").toEqual([card.id]);
  const unthreaded = recalibrate(BASELINE, notes, "v2", 1, { cards, scope: {} });
  expect(unthreaded.refusals).toEqual([]);
});

/* ───────────────────────── case 7: recalibrate holds the source's conclusions ── */

test("case 7: a reasoned notebook's conclusions reach the prompt beside the notebook, and the fixture's never do", () => {
  const nb = liveNotebook();
  const body = { notebook: nb, conclusions: nb.conclusions, renders: RENDERS, scope: {}, notes: [{ kind: "less-focus", cardId: "f-volume" }] };
  const { prompt, manifest } = assembleRecalibrate(body, "SYSTEM");
  const block = (name: string) => manifest.blocks.find((b) => b.name === name);
  expect(manifest.conclusions!.held, "c-x is out of scope and unnamed: held, by id").toEqual([OWN_CONCLUSION.id]);
  expect(prompt).toContain(OWN_CONCLUSION.id);
  for (const c of CONCLUSIONS) expect(prompt, `the fixture's ${c.id} rode in`).not.toContain(c.id);
  // Beside the notebook, never in it.
  const notebookLine = prompt.slice(prompt.indexOf("## NOTEBOOK\n") + 12).split("\n")[0]!;
  expect(Object.keys(JSON.parse(notebookLine))).not.toContain("conclusions");
  expect(block("conclusions")).toBeTruthy();

  // Absent means none, as /api/script reads it - not the fixture's seven.
  const bare = assembleRecalibrate({ ...body, conclusions: undefined, notebook: {} }, "SYSTEM");
  expect(bare.manifest.conclusions).toEqual({ whole: [], held: [] });
  expect(bare.prompt).not.toContain(CONCLUSIONS[0]!.id);
});

test("case 7: the size check counts the source's conclusions", () => {
  const src = code("lib/turns/assemble/recalibrate.ts");
  expect(src).not.toMatch(/import \{ CONCLUSIONS \}/);
  expect(src).toMatch(/NOTEBOOK_DROP = \[[^\]]*"conclusions"/);
  expect(src).toMatch(/\["notebook", "conclusions", "renders", "scope", "notes"\]/);
});

/* ───────────────────────── case 11: follow-ups answer only on the replay ─────── */

test("case 11: a canned transcript answers only on the replay source", async () => {
  const live = reasoned();
  const ask = { kind: "question" as const, prompt: "whale holders" };
  expect(resultFor(ask, live)).toBeUndefined();
  expect(resultFor(ask, fixtureSource())).toBe(CANNED["q-whales"]);
  expect(resultFor(ask)).toBe(CANNED["q-whales"]);
  expect(resultFor({ kind: "deepen-card", cardId: Object.keys(CANNED).find((k) => k !== "q-whales")!, prompt: "" }, live)).toBeUndefined();
  // What the sentence says is still true: it no longer claims one static document.
  expect(code("lib/research/followup.ts")).not.toContain("one static document shared by every project");
});
