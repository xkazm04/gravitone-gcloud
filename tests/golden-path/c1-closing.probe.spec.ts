// LANE — THE C1 CLOSING STAGE (critic-2026-10-07-script-chain, Part 1), the cases
// that are not Frames (those are in frames-notebook.probe.spec.ts) and not the
// widened ratchet (notebook-source.probe.spec.ts).
//
// Driven on fake-indexeddb, over the real step store, with the hook harness
// active-notebook.probe.spec.ts uses (tests/golden-path/_c1-harness.ts).
import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { buildCards } from "@/app/_phases/_shared/notebook/cards";
import { fixtureSource } from "@/app/_phases/_shared/notebook/source";
import { CONCLUSIONS } from "@/app/_phases/_shared/notebook/conclusions";
import { dispatchToggles } from "@/app/_phases/script/dispatchToggles";
import { RENDERS } from "@/app/_phases/script/renders";
import type { PreviewOutcome } from "@/lib/turns/client";
import { assembleRecalibrate } from "@/lib/turns/assemble/recalibrate";
import { CANNED, resultFor } from "@/app/_phases/research/followup";
import { optInIds } from "@/app/_phases/research/scope";
import { recalibrate } from "@/app/_phases/script/recalibrate";
import { outWord } from "@/app/_phases/script/scopeConflicts";
import { BASELINE, type Note } from "@/app/_phases/script/versions";
import { readActiveNotebook } from "@/app/_phases/_shared/notebook/useActiveNotebook";
import { readStep, saveStep, type ScopeStepData } from "@/app/_phases/_shared/stepStore";
import { makeTriageSource } from "@/lib/board/sources/triage";
import { addProjects } from "@/lib/projects";

import { stripComments } from "./_helpers";
import { landLive, liveNotebook, OWN_CONCLUSION } from "./_c1-harness";

const code = (rel: string) => stripComments(readFileSync(path.join(process.cwd(), rel), "utf8"));

async function explainerProject(uid: string, id: string) {
  const now = Date.now();
  await addProjects([
    {
      id,
      uid,
      title: `Project ${id}`,
      logline: "",
      template: "mid-educational-video",
      discipline: "educational",
      targetS: 300,
      createdAt: now,
      updatedAt: now,
      phase: "research",
      progress: { research: "done", script: "empty", frames: "empty", score: "empty", cut: "empty" },
    } as never,
  ]);
}

const scopeOf = async (id: string) => {
  const r = await readStep<ScopeStepData>(id, "research-scope");
  expect(r.ok).toBe(true);
  return r.ok ? r.data : undefined;
};

/* ───────────────────────── case 9: the Board deals P's own cards ────────────── */

test("case 9: a /board verdict keeps the stored digest and the Board deals the project's own cards", async () => {
  const uid = "c1-board-uid";
  const pid = "c1-board-own";
  await explainerProject(uid, pid);
  await landLive(pid);
  const src = (await readActiveNotebook(pid))!;
  expect(src.kind).toBe("reasoned");
  // The scope the project's own Research step wrote: stamped with its digest.
  await saveStep<ScopeStepData>(pid, "research-scope", { scope: {}, confirmed: null, digest: src.digest });

  const triage = makeTriageSource({ uid });
  const rows = (await triage.loadEntries()).filter((r) => r.item.projectId === pid);
  const own = buildCards(src).map((c) => c.id).sort();
  expect(rows.map((r) => r.item.id.split("::")[1]).sort(), "the Board is dealing another notebook's cards").toEqual(own);
  // The own conclusion is opt-in: not taken, and not a decision.
  const concl = rows.find((r) => r.item.id.endsWith(`::${OWN_CONCLUSION.id}`));
  expect(concl, "the notebook's own conclusion is not on the Board").toBeTruthy();
  expect(concl!.item.verdict).toBe(null);

  const cuttable = rows.find((r) => !r.refuse.reject && !r.item.id.endsWith(`::${OWN_CONCLUSION.id}`))!;
  await triage.decide(cuttable.item.id, "reject");
  const after = await scopeOf(pid);
  expect(after?.digest, "the verdict dropped the digest - the scope is now the fixture's").toBe(src.digest);
  expect(Object.keys(after!.scope)).toEqual([cuttable.item.id.split("::")[1]]);

  // Taking the opt-in conclusion writes against ITS default, not the fixture's.
  await triage.decide(concl!.item.id, "approve");
  const taken = await scopeOf(pid);
  expect(taken!.scope[OWN_CONCLUSION.id]?.descoped).toBe(false);
  expect(taken!.digest).toBe(src.digest);
});

test("case 9: a verdict over an orphaned scope is refused, and nothing is written", async () => {
  const uid = "c1-board-uid";
  const pid = "c1-board-orphan";
  await explainerProject(uid, pid);
  await landLive(pid);
  const orphan: ScopeStepData = {
    scope: { "f-ath": { descoped: true, liked: false, deepen: false } },
    confirmed: null,
    digest: fixtureSource().digest,
  };
  await saveStep<ScopeStepData>(pid, "research-scope", orphan);

  const triage = makeTriageSource({ uid });
  const rows = (await triage.loadEntries()).filter((r) => r.item.projectId === pid);
  expect(rows.every((r) => r.item.verdict === null), "an orphaned scope's verdicts were applied").toBe(true);
  const row = rows.find((r) => !r.refuse.reject)!;
  await expect(triage.decide(row.item.id, "reject")).rejects.toMatchObject({ name: "VerdictRefused" });
  const after = await scopeOf(pid);
  expect(after?.digest).toBe(orphan.digest);
  expect(after?.scope).toEqual(orphan.scope);
});

test("case 9: a project with no record still deals the fixture board and writes the fixture digest", async () => {
  const uid = "c1-board-uid";
  const pid = "c1-board-replay";
  await explainerProject(uid, pid);
  await saveStep(pid, "research", { topic: "bitcoin", researched: true });
  const triage = makeTriageSource({ uid });
  const rows = (await triage.loadEntries()).filter((r) => r.item.projectId === pid);
  expect(rows.map((r) => r.item.id.split("::")[1]).sort()).toEqual(buildCards(fixtureSource()).map((c) => c.id).sort());
  const row = rows.find((r) => !r.refuse.reject)!;
  await triage.decide(row.item.id, "reject");
  expect((await scopeOf(pid))?.digest).toBe(fixtureSource().digest);
});

/* ───────────────────── case 10: Script waits for the active notebook ─────────── */
// No DOM in this lane, so this is read off the source: ScriptStep's skeleton
// gate is `ready`, and the gate has to name the active notebook's `hydrated`.

test("case 10: ScriptStep's ready waits for the active notebook, and the skeleton hangs on ready", () => {
  const src = code("app/_phases/script/ScriptStep.tsx");
  expect(src).toMatch(/const active = useActiveNotebook\(projectId\)/);
  const ready = /const ready = ([^;]+);/.exec(src)?.[1] ?? "";
  expect(ready, "ready does not wait for the active notebook").toContain("active.hydrated");
  expect(src).toMatch(/\{!ready \? \(\s*<Skeleton \/>/);
});

/* ───────────────────────── case 8: Step 2 reads the source's opt-in ──────────── */

test("case 8: an undecided live conclusion is not-taken in Step 2, and the recalibrate guard treats it as out", async () => {
  await landLive("c1-optin");
  const src = (await readActiveNotebook("c1-optin"))!;
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

test("case 8: the matrix and the conflict readers take the set from useScope().optIn", () => {
  for (const f of ["_matrix/MatrixSpend.tsx", "_matrix/MatrixTracks.tsx", "_matrix/MatrixCoverage.tsx", "_matrix/shared.tsx"]) {
    const src = code(`app/_phases/script/${f}`);
    expect(src, f).toContain("api.optIn");
    expect(src, f).not.toMatch(/stateOf\(api\.scope, card\.id\)|outWord\(card, api\.scope\)/);
  }
  const step = code("app/_phases/script/ScriptStep.tsx");
  expect(step).toMatch(/useVersions\(projectId, \{[^}]*optIn: scope\.optIn/);
  expect(step).toContain("conflictsIn(weighed, scope.cards, scope.scope, scope.optIn)");
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

  // The strip lists a held c-x, in the source's own order.
  const outcome = { ok: true, preview: { manifest } } as unknown as PreviewOutcome;
  expect(dispatchToggles(outcome, [], [], nb.conclusions ?? []).filter((t) => t.group === "conclusions").map((t) => t.id)).toEqual([
    OWN_CONCLUSION.id,
  ]);
});

test("case 7: useVersions sends the source's conclusions, and the size check counts them", () => {
  expect(code("app/_phases/script/useVersions.ts")).toContain("conclusions: ctx.source.conclusions");
  const src = code("lib/turns/assemble/recalibrate.ts");
  expect(src).not.toMatch(/import \{ CONCLUSIONS \}/);
  expect(src).toMatch(/NOTEBOOK_DROP = \[[^\]]*"conclusions"/);
  expect(src).toMatch(/\["notebook", "conclusions", "renders", "scope", "notes"\]/);
});

/* ───────────────────────── case 11: follow-ups answer only on the replay ─────── */

test("case 11: a canned transcript answers only on the replay source", async () => {
  await landLive("c1-followup");
  const reasoned = (await readActiveNotebook("c1-followup"))!;
  const ask = { kind: "question" as const, prompt: "whale holders" };
  expect(resultFor(ask, reasoned)).toBeUndefined();
  expect(resultFor(ask, fixtureSource())).toBe(CANNED["q-whales"]);
  expect(resultFor(ask)).toBe(CANNED["q-whales"]);
  expect(resultFor({ kind: "deepen-card", cardId: Object.keys(CANNED).find((k) => k !== "q-whales")!, prompt: "" }, reasoned)).toBeUndefined();
  // What the sentence says is still true: it no longer claims one static document.
  expect(code("app/_phases/research/followup.ts")).not.toContain("one static document shared by every project");
  expect(code("app/_phases/research/_parts/FollowUpQueue.tsx")).toContain("resultFor(r, api.source)");
});
