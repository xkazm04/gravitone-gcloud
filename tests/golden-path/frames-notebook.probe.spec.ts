// LANE — FRAMES READS THE DEALT NOTEBOOK (C1 closing stage, part a; critic cases 1-3).
//
// useFrames used to import `FACTS` from facts.ts, the shipped Bitcoin run, at the
// three places a notebook reaches the step: the binding list the canvas offers,
// the brief the direction pass is sent, and the facts a landing is graded
// against. A creator's own reasoned notebook was therefore never what Frames
// bound to, briefed with or graded by.
//
// Driven against the real hook over fake-indexeddb with the dispatcher
// _c1-harness.ts holds (no DOM in this lane), and a spy on `fetch` for the
// pre-flight (/api/turns/preview) and the start (/api/frames) bodies.
import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { saveRecord } from "@/app/_phases/_shared/records/patch";
import { readRecord } from "@/app/_phases/_shared/records/registry";
import { FACTS } from "@/app/_phases/_shared/notebook/facts";
import { fixtureSource } from "@/app/_phases/_shared/notebook/source";
import { landDirection } from "@/app/_phases/frames/direction";
import { unitsFromFrames } from "@/app/_phases/frames/picture/unit";
import { FRAMES_RECORD } from "@/app/_phases/frames/records";
import { useFrames } from "@/app/_phases/frames/useFrames";
import { addProjects } from "@/lib/projects";

import { stripComments } from "./_helpers";
import { harness, landLive } from "./_c1-harness";

const ROOT = process.cwd();

async function project(id: string) {
  const now = Date.now();
  await addProjects([
    {
      id,
      uid: "frames-nb-uid",
      title: `Project ${id}`,
      logline: "",
      template: "mid-educational-video",
      discipline: "educational",
      targetS: 300,
      createdAt: now,
      updatedAt: now,
      phase: "frames",
      progress: { research: "done", script: "done", frames: "empty", score: "empty", cut: "empty" },
    } as never,
  ]);
}

interface Seen {
  url: string;
  body: Record<string, unknown>;
}

/** A `fetch` that records what the hook asks the server and answers "no". */
function spyFetch(): { seen: Seen[]; restore: () => void } {
  const real = globalThis.fetch;
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/turns/preview") || url.includes("/api/frames")) {
      seen.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ detail: "probe" }), { status: 503 });
    }
    return new Response(JSON.stringify({ detail: "no" }), { status: 404 });
  }) as typeof fetch;
  return { seen, restore: () => void (globalThis.fetch = real) };
}

const mount = (id: string) => harness(() => useFrames(id));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idsOf = (xs: readonly { id: string }[]) => xs.map((f) => f.id);

/* ─────────────────── case 1: Frames on a reasoned notebook ──────────────────── */

test("case 1: a reasoned notebook's facts are what Frames binds, briefs with and grades by", async () => {
  const pid = "fr-reasoned";
  await project(pid);
  const nb = await landLive(pid);
  const spy = spyFetch();
  const h = mount(pid);
  try {
    const ctl = await h.settleUp();
    expect(ctl.notebook.kind).toBe("reasoned");
    expect(ctl.facts, "the binding list is not the dealt notebook's facts").toEqual(nb.facts);
    expect(idsOf(ctl.facts).some((id) => FACTS.some((f) => f.id === id))).toBe(false);

    // The pre-flight reads the same body the start sends.
    await wait(900);
    await h.settleUp();
    const preview = spy.seen.find((s) => s.url.includes("/api/turns/preview"));
    expect(preview, "no pre-flight was asked for").toBeTruthy();
    const sent = ((preview!.body.input as { facts: { id: string }[] }).facts ?? []).map((f) => f.id);
    expect(sent).toEqual(idsOf(nb.facts));
    expect(sent.some((id) => FACTS.some((f) => f.id === id)), "a facts.ts id is in the payload").toBe(false);

    await h.current.direct();
    const start = spy.seen.find((s) => s.url.includes("/api/frames"));
    expect(start, "the pass was not started").toBeTruthy();
    expect((start!.body.facts as { id: string }[]).map((f) => f.id)).toEqual(idsOf(nb.facts));
  } finally {
    h.unmount();
    spy.restore();
  }
});

test("case 1: a landed scene spec citing a fact the notebook does not have is rejected", async () => {
  const pid = "fr-reasoned-land";
  await project(pid);
  await landLive(pid);
  const h = mount(pid);
  const ctl = await h.settleUp();
  const frames = ctl.frames;
  expect(frames.length).toBeGreaterThan(0);
  const raw = JSON.stringify({
    scenes: [
      {
        beatAt: frames[0]!.at,
        subject: "a long shallow harbour channel seen from above at dusk",
        motion: "a slow push in along the channel",
        texts: [{ role: "figure", value: "$126k", factId: "f-ath" }],
      },
    ],
  });
  const landing = landDirection(raw, frames, ctl.facts);
  expect(Object.values(landing.rejections).join(" ")).toMatch(/not in this notebook/);
  expect(landing.specs).toEqual([]);
  h.unmount();
});

/* ─────────────────────────── case 2: the replay ─────────────────────────────── */

test("case 2: with no record Frames deals the shipped facts, byte for byte", async () => {
  const pid = "fr-replay";
  await project(pid);
  const spy = spyFetch();
  const h = mount(pid);
  try {
    const ctl = await h.settleUp();
    expect(ctl.notebook).toBe(fixtureSource());
    expect(ctl.facts, "the replay's facts are not the shipped FACTS array").toBe(FACTS);
    await wait(900);
    await h.settleUp();
    const preview = spy.seen.find((s) => s.url.includes("/api/turns/preview"));
    const expected = FACTS.map((f) => ({ id: f.id, claim: f.claim, confidence: f.confidence, loadBearing: f.loadBearing }));
    expect((preview!.body.input as { facts: unknown }).facts).toEqual(expected);
  } finally {
    h.unmount();
    spy.restore();
  }
});

/* ───────────────────────── case 3: dangling bindings ────────────────────────── */

test("case 3: a figure bound to a fact the notebook lacks counts as unbound, and nothing is written on mount", async () => {
  const replayPid = "fr-dangle-replay";
  const pid = "fr-dangle";
  await project(replayPid);
  await project(pid);
  await landLive(pid);

  // A stored cut whose first beat carries a figure bound to a shipped fact.
  const seed = await mount(replayPid).settleUp();
  const frames = seed.frames.map((f, i) =>
    i === 0
      ? { ...f, texts: [...f.texts, { id: "t-dangle", role: "figure" as const, value: "$126k", x: 6, y: 40, factId: "f-ath" }] }
      : f,
  );
  const record = {
    units: unitsFromFrames(frames, { sourceId: seed.render.id, totalS: seed.render.durationS }),
    frames,
    renderId: seed.render.id,
  };
  for (const id of [replayPid, pid]) expect((await saveRecord(FRAMES_RECORD, id, record)).ok).toBe(true);
  const figures = frames.flatMap((f) => f.texts.filter((t) => t.role === "figure")).length;
  expect(figures).toBeGreaterThan(0);
  const before = JSON.stringify(await readRecord(FRAMES_RECORD, pid));

  const onReplay = await mount(replayPid).settleUp();
  const h = mount(pid);
  const ctl = await h.settleUp();
  // On the replay the binding is a source. On the reasoned project it cites a
  // fact the project never had, so every figure is unbound.
  expect(onReplay.unboundFigures).toBe(figures - 1);
  expect(ctl.unboundFigures).toBe(figures);

  await wait(1000);
  await h.settleUp();
  expect(JSON.stringify(await readRecord(FRAMES_RECORD, pid)), "the mount rewrote the stored cut").toBe(before);
  h.unmount();
});

test("case 3: the select carries a dangling id as its own option, in the unsourced tone", () => {
  const src = stripComments(readFileSync(path.join(ROOT, "app/_phases/frames/FramesAssembly.tsx"), "utf8"));
  expect(src).toMatch(/const dangling = Boolean\(t\.factId\) && !facts\.some\(\(f\) => f\.id === t\.factId\)/);
  expect(src).toContain("<option value={t.factId}>");
  expect(src).toMatch(/t\.factId && !dangling \? "border-white\/10 text-white\/60" : "border-amber-300\/40 text-amber-200"/);
  const hook = stripComments(readFileSync(path.join(ROOT, "app/_phases/frames/useFrames.ts"), "utf8"));
  expect(hook).not.toMatch(/from "\.\.\/_shared\/notebook\/facts"/);
  expect(hook).toMatch(/const ready = [^;]*active\.hydrated/);
});
