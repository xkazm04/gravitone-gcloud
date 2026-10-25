// The style atelier's parts (Phase 5, L51): which plate a trial column shows, where J/K land,
// what the atelier's keys answer, and the markup the sheet and the ratchet speak - pure functions
// over literal data, the components through react-dom/server.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { STYLE_TRIALS } from "@gt/domain/style.ratchet";
import type { ProofState, StyleCoverageRow, StyleLockGate, StyleProofView } from "@gt/domain/styleView";

import { LockGate } from "../../src/components/style/LockGate.tsx";
import { ProofSheet } from "../../src/components/style/ProofSheet.tsx";
import { EvidenceTable } from "../../src/components/style/StyleFacts.tsx";
import { proofLook, spendWords, stepProof, trialColumns } from "../../src/components/style/style.ts";
import { KEYMAP } from "../../src/keymap/bindings.ts";
import { chordsOf } from "../../src/keymap/chord.ts";
import { conflicts, resolve } from "../../src/keymap/keymap.ts";
import { NO_TARGET } from "../../src/keymap/target.ts";

const blob = { sha256: "a".repeat(64), bytes: 1, mime: "image/jpeg" };
const proof = (id: string, trialId: string, state: ProofState, lineage: StyleProofView["lineage"] = "current", at = "2026-09-02T09:40:00.000Z", note?: string): StyleProofView => ({
  id,
  label: id,
  media: blob,
  state,
  trialId,
  lineage,
  at,
  ...(note === undefined ? {} : { note }),
});
const noop = (): void => undefined;
const SHEET = { approved: 1, pending: 1, rejected: 1, cap: 14, spend: { usd: 0.09, unpriced: 1 } };

describe("the trial matrix's columns", () => {
  test("a column's face is its newest plate under the CURRENT block; an earlier block's never stands", () => {
    const cols = trialColumns(STYLE_TRIALS, [
      proof("old", "peak-and-fall", "approved", "stale", "2026-09-09T00:00:00.000Z"),
      proof("a", "peak-and-fall", "rejected", "current", "2026-09-01T00:00:00.000Z"),
      proof("b", "peak-and-fall", "pending", "current", "2026-09-02T00:00:00.000Z"),
    ]);
    const fall = cols.find((c) => c.trial.id === "peak-and-fall");
    expect(fall).toMatchObject({ face: { id: "b" }, approved: 0, rejected: 1, pending: 1, stale: 1 });
    expect(cols.find((c) => c.trial.id === "the-exit")?.face).toBeNull();
  });

  test("a stale approval reads idle - it no longer vouches for the words", () => {
    expect(proofLook({ state: "approved", lineage: "stale" })).toBe("idle");
    expect(proofLook({ state: "approved", lineage: "current" })).toBe("done");
    expect(proofLook({ state: "rejected", lineage: "current" })).toBe("failed");
  });

  test("J/K start at the first plate and stop at the ends; spend counts the unpriced, never zeroes them", () => {
    expect(stepProof(["a", "b", "c"], null, 1)).toBe("a");
    expect(stepProof(["a", "b", "c"], null, -1)).toBe("c");
    expect(stepProof(["a", "b", "c"], "c", 1)).toBe("c");
    expect(stepProof([], null, 1)).toBeNull();
    expect(spendWords({ usd: 0.09, unpriced: 2 })).toBe("$0.09 · 2 unpriced");
  });
});

describe("the atelier's keys", () => {
  const verb = (key: string, facts: readonly string[] = [], target = NO_TARGET, extra: { shiftKey?: boolean } = {}) =>
    resolve(KEYMAP, { chords: chordsOf({ key, ...extra }), repeat: false, target }, "style", new Set(facts))?.binding.verb ?? null;
  const note = { editable: true, field: "proof-note", control: true };

  test("the table stays conflict-free with the style mode in it", () => {
    expect(conflicts(KEYMAP)).toEqual([]);
  });

  test("a verdict needs a held, judgeable plate; ⇧L needs the server's gate open", () => {
    expect(verb("a")).toBeNull();
    expect(verb("a", ["judge"])).toBe("approve");
    expect(verb("r", ["judge"])).toBe("reject");
    expect(verb("L", [], NO_TARGET, { shiftKey: true })).toBeNull();
    expect(verb("L", ["lockable"], NO_TARGET, { shiftKey: true })).toBe("lock");
    expect(verb("g")).toBeNull();
    expect(verb("g", ["chosen"])).toBe("generate");
  });

  test("inside the reject note ⏎ lands it and a letter is text, not a verdict", () => {
    expect(verb("Enter", ["judge"], note)).toBe("attach");
    expect(verb("a", ["judge"], note)).toBeNull();
    expect(verb("Escape", ["proof"], note)).toBe("leave-field");
  });
});

describe("the sheet and the ratchet, drawn", () => {
  const sheet = (judge: boolean, noting: { id: string; note: string } | null = null) =>
    renderToStaticMarkup(
      h(ProofSheet, {
        proofs: [proof("p1", "peak-and-fall", "pending"), proof("p2", "flywheel", "rejected", "current", undefined, "the arrows lost their edge")],
        sheet: SHEET,
        srcOf: () => "/x.jpg",
        held: "p1",
        onHold: noop,
        ...(judge ? { onJudge: noop } : {}),
        noting,
        onNote: noop,
        onAttach: noop,
        onCancelNote: noop,
        busy: false,
      }),
    );

  test("a rejection keeps its note on the plate; a locked sheet offers no verdict", () => {
    expect(sheet(true)).toContain("the arrows lost their edge");
    expect(sheet(true)).toContain(">approve<");
    expect(sheet(false)).not.toContain(">approve<");
    expect(sheet(false)).not.toContain(">reject<");
  });

  test("reject asks for its reason in the note field the keymap names", () => {
    const html = sheet(true, { id: "p1", note: "" });
    expect(html).toContain('data-keyfield="proof-note"');
    expect(html).toContain("keep undecided");
  });

  const COVER: readonly StyleCoverageRow[] = [{ problem: "quantity", trialIds: ["peak-and-fall"], approved: 1, rejected: 0, covered: true }];
  const gate = (why: string, lock: StyleLockGate) => renderToStaticMarkup(h(LockGate, { status: "proven", why, keptCells: 2, provenKeeps: 2, coverage: COVER, lockProblems: 3, lock }));

  test("the gate's sentence is drawn once: beside the status when it IS the why, under it when not", () => {
    const blocker = "1 proof still undecided";
    const count = (html: string) => html.split(blocker).length - 1;
    expect(count(gate(blocker, { can: false, blocker, legacySheet: false }))).toBe(1);
    expect(count(gate("operator keeps in 1 of 2 cells", { can: false, blocker, legacySheet: false }))).toBe(1);
    expect(gate("the gate holds — it may lock", { can: true, blocker: null, legacySheet: false })).toContain("data-can-lock");
  });
});

describe("the evidence table", () => {
  const row = (scene: string, verdict: "keep" | "reject", by: "operator" | "agent") => ({ run: "2026-09-01-night", scene, mechanism: "m", verdict, at: "2026-09-01T00:00:00.000Z", by, counts: verdict === "keep" && by === "operator" });

  test("an agent's keep is drawn in the table and marked, never counted in the tallies", () => {
    const html = renderToStaticMarkup(h(EvidenceTable, { rows: [row("s1", "keep", "operator"), row("s2", "keep", "agent"), row("s3", "reject", "operator")] }));
    expect(html).toContain("keep 1<");
    expect(html).toContain("reject 1<");
    expect(html).toContain("evidence kept 1, rejected 1, undecided 0");
    expect(html).toContain("an agent&#x27;s verdict: shown, not counted");
    expect(html.split("<tr").length - 1).toBe(4);
  });
});

describe("the ratchet, locked", () => {
  const COVERED: readonly StyleCoverageRow[] = [{ problem: "quantity", trialIds: ["peak-and-fall"], approved: 1, rejected: 0, covered: true }];
  const locked = (why: string) =>
    renderToStaticMarkup(h(LockGate, { status: "locked", why, keptCells: 3, provenKeeps: 2, coverage: COVERED, lockProblems: 1, lock: { can: false, blocker: null, legacySheet: false, lockedAt: "2026-08-20T11:30:00.000Z", lockedBy: "operator" } }));

  test("the lock's date and hand are drawn once: the why says them when it carries them", () => {
    // The sentence styleView's `why` writes for a lock (packages/domain/src/styleView.ts).
    const why = "locked 2026-08-20 by operator — the block is frozen; duplicate to change the look";
    expect(locked(why).split("2026-08-20").length - 1).toBe(1);
    expect(locked("locked — projects build on this block").split("2026-08-20").length - 1).toBe(1);
  });
});
