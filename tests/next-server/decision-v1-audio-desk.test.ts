// THE AUDIO DESK'S INSIGHT ISLANDS, RENDERED ON THE SERVER (Phase 6, L66): the three sections
// mount over a real read of a temp sound store and kernel - strengths, rubric, batch - and draw
// what their reads hold: a waiting cell as pips and the word, a measured one as its figure, a
// judged take's brief miss beside its rubric, a withheld engine's reason over the batch. A smoke
// over the client islands' first render (next/navigation and the shell are stand-ins); the
// behaviour of every part is decision-v1-audio-insight.test.ts's and @gt/ui's.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("../../app/(studio)/_shell/Providers.tsx", () => ({ useShell: () => ({ toast: () => {} }) }));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-audio-desk-ssr-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BatchDesk } from "../../app/(studio)/audio/_insight/Batch.tsx";
import { batchConfirm, batchReceipt, scoreTake } from "../../app/(studio)/audio/_insight/acts.ts";
import { confirmLessonAct } from "../../app/(studio)/audio/_lessons/acts.ts";
import { readBatch, readRubricPile, readStrengths } from "../../app/(studio)/audio/_insight/read.ts";
import { RubricDesk } from "../../app/(studio)/audio/_insight/Rubric.tsx";
import { StrengthsDesk } from "../../app/(studio)/audio/_insight/Strengths.tsx";
import { closeKernel } from "../../lib/kernelStore.ts";
import { engineRegistry } from "../../lib/sound/engines.ts";
import type { SoundTake } from "../../lib/sound/types.ts";

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const take = (id: string, over: Partial<SoundTake> = {}): SoundTake => ({
  id,
  kind: "music",
  title: `Take ${id}`,
  provider: "suno",
  op: "manual",
  origin: "lab",
  technique: [],
  prompt: `prompt ${id}`,
  negative: null,
  terms: { genre: ["ambient"], mood: [], instrument: [], sfxCategory: null },
  tempoBpm: null,
  key: null,
  durationS: 30,
  loop: null,
  file: null,
  peaks: null,
  measured: null,
  ratings: {},
  verdict: "kept",
  reasons: [],
  note: null,
  stage: "pending",
  group: null,
  label: null,
  parentId: null,
  huntId: null,
  nodeId: null,
  songId: null,
  plan: null,
  referenceTrackId: null,
  promptRound: null,
  draftId: null,
  variation: null,
  editModes: null,
  fileName: null,
  projectId: null,
  cueId: null,
  createdAt: "2026-10-10T00:00:00.000Z",
  judgedAt: "2026-10-10T00:00:00.000Z",
  finalizedAt: null,
  ...over,
});

const row = (t: SoundTake) => ({ takeId: t.id, kind: t.kind, provider: t.provider, op: t.op, origin: t.origin, technique: t.technique, terms: t.terms, prompt: t.prompt, negative: null, durationS: 30, verdict: t.verdict, ratings: t.ratings, score: null, reasons: [], huntId: null, judgedAt: t.judgedAt });

const TAKES = [
  take("a1", { measured: { tempoBpm: 96, key: null, durationS: 30, lufs: null, truePeakDb: null, energy: null }, tempoBpm: 120 }),
  take("a2"),
  take("a3", { verdict: "rejected", stage: null }),
  take("b1", { terms: { genre: ["drone"], mood: [], instrument: [], sfxCategory: null } }),
  take("u1", { verdict: "unjudged", stage: null }),
];

mkdirSync(path.join(ROOT, "sound"), { recursive: true });
writeFileSync(path.join(ROOT, "sound", "takes.json"), JSON.stringify({ version: 1, takes: TAKES }));
writeFileSync(path.join(ROOT, "ledger.json"), JSON.stringify({ verdicts: TAKES.filter((t) => t.verdict !== "unjudged").map(row), lessons: [] }));

describe("the insight sections' first render", () => {
  it("strengths: ambient on Suno is a figure (n=3), drone is waiting with no figure", async () => {
    const html = renderToStaticMarkup(h(StrengthsDesk, { view: await readStrengths("music"), lessonDoor: confirmLessonAct }));
    expect(html).toContain("Suno on ambient: kept 67% of 3");
    expect(html).toContain("Suno on drone: 1 judged, 2 more before a rate");
    expect(html).not.toContain("100%");
  });

  it("rubric: the judged takes only, unscored, the asked tempo's miss beside the take that missed it", async () => {
    const html = renderToStaticMarkup(h(RubricDesk, { view: await readRubricPile("music"), acts: { scoreTake } }));
    expect(html).toContain('data-take="a1"');
    expect(html).not.toContain('data-take="u1"');
    expect(html).toContain("tempo asked 120 bpm, measured 96 bpm, −24 bpm");
    expect(html).toContain("unscored 4 of 4");
  });

  it("batch: music runs on Suno; effects on ElevenLabs while the capability is on, and its reason when off", () => {
    const reg = engineRegistry({ musicSectionEdit: true, musicSfx: true });
    const music = renderToStaticMarkup(h(BatchDesk, { view: readBatch("music", reg), nowMs: 0, acts: { batchReceipt, batchConfirm } }));
    expect(music).toContain("Price 2 × take");
    expect(music).toContain(">Suno<");
    const sfx = renderToStaticMarkup(h(BatchDesk, { view: readBatch("sfx", reg), nowMs: 0, acts: { batchReceipt, batchConfirm } }));
    expect(sfx).toContain(">ElevenLabs<");
    expect(sfx).not.toContain("makes no sfx batch on this desk");
    const off = engineRegistry({ musicSectionEdit: true, musicSfx: false });
    const none = renderToStaticMarkup(h(BatchDesk, { view: readBatch("sfx", off), nowMs: 0, acts: { batchReceipt, batchConfirm } }));
    expect(none).toContain("ElevenLabs makes no sfx batch on this desk:");
    expect(none).toContain('aria-disabled="true"');
  });
});
