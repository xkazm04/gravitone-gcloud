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
import { readActiveNotebook } from "@/app/_phases/_shared/notebook/useActiveNotebook";
import { readStep, saveStep, type ScopeStepData } from "@/app/_phases/_shared/stepStore";
import { makeTriageSource } from "@/lib/board/sources/triage";
import { addProjects } from "@/lib/projects";

import { stripComments } from "./_helpers";
import { landLive, OWN_CONCLUSION } from "./_c1-harness";

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
