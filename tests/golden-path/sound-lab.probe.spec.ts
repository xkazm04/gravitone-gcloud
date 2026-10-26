// LANE — THE AUDIO DESK'S ENGINE SEAM, AND THE EDIT A RENDER IS CHARGED FOR (dynamic).
//
// This probe was the Sound lab's (app/playground, 2026-10-05): five things that could quietly
// break filing a render as a take. The lab retired in Phase 6 wave C - every tool rebuilt as a
// section of the Audio desk (/audio) - and so did the half of this probe that drove its browser
// model (app/playground/labModel.ts, engines.ts) over a v1 IndexedDB fixture. What it guarded, and
// where each guard lives now:
//
//   1. THE ENGINE SEAM - kept here. The registry (lib/sound/engines.ts since Phase 6 L60) is the
//      only place that knows Suno composes through its browser job and takes a round trip,
//      ElevenLabs is copy-only on the desk and Local is declared-not-installed - and a withheld
//      operation keeps its reason, verbatim. Never a fake take for an engine not installed.
//   2. THE EDIT - kept here, on the server's own copy (lib/sound/editPlan.ts, which
//      lib/sound/generate.ts renders and guards with). Kept sections are references at the
//      source's ranges; regenerated ones carry the conditioning the mode asked for; only the
//      regenerated seconds count as new audio (the meter books the whole plan -
//      sound-generate-door.probe.spec.ts).
//   Retired with the lab's model, each with its successor:
//   · the mapping of a render into AudioMeta (`renderMeta`): takes are filed on the server now
//     (lib/sound/takes.ts createTake, lib/sound/huntRender.ts), held by sound-hunt and the
//     audio desk tests;
//   · Suno's style line and tags (`sunoFields`): @gt/ui recipe.ts, held by
//     packages/ui/test/components/audio.test.ts ("Suno's form from a seed");
//   · the fan-out and the `variationsOfSeed` lift: the hunt drafts a map of axes and leaves
//     (lib/sound/hunt.ts, @gt/ui hunt.ts), held by sound-hunt.probe and
//     packages/ui/test/components/hunt.test.ts; lib/sound/audio/variations.ts retired with it;
//   · the hunt read back from takes by `hunt_id` (`hunts`, `laneOf`): a hunt is its own record
//     whose crown is a keep (lib/sound/huntDesk.ts), held by the same two.

import { test, expect } from "@playwright/test";

import { can, engineById, engineRegistry, engineState, makersOf, NO_DESK_PRODUCER } from "@/lib/sound/engines";
import { buildEditPlan, editSeconds } from "@/lib/sound/editPlan";
import { ABSENCE_REASON } from "@/lib/capabilities";
import type { WireAudioRefChunk, WireGenerationChunk, WirePlan } from "@/lib/music/types";

const PLAN: WirePlan = {
  chunks: [
    { text: "Low strings intro", duration_ms: 6000, positive_styles: ["strings"], negative_styles: [] },
    { text: "Pulse build", duration_ms: 8000, positive_styles: ["arp"], negative_styles: [] },
    { text: "Full drop", duration_ms: 10000, positive_styles: ["kick"], negative_styles: ["vocals"] },
    { text: "Release", duration_ms: 6000, positive_styles: [], negative_styles: [] },
  ],
};

/* ── 1 · the engine seam ─────────────────────────────────────────────── */

test("registry: Suno composes through the browser job, ElevenLabs is copy-only with its reasons, Local declared", () => {
  // The desk's registry (lib/sound/engines.ts, Phase 6 L60). Suno's row flipped when its automation
  // landed (a seed is a box.chrome job); ElevenLabs renders nothing from the desk, and each render
  // op keeps its place in `withheld` with the reason.
  const on = engineRegistry({ musicSectionEdit: true, musicSfx: true });
  console.log(`[desk] engines ${on.map((e) => `${e.id}:${e.transport}:${engineState(e)}:${e.ops.join("+")}`).join(" ")}`);
  const suno = engineById(on, "suno");
  const el = engineById(on, "elevenlabs");
  const local = engineById(on, "local");
  expect(suno?.transport).toBe("browser");
  expect(can(suno, "compose")).toBe(true);
  expect(can(suno, "file-return")).toBe(true);
  expect(can(suno, "sfx")).toBe(false);
  expect(el?.transport).toBe("api");
  expect(el?.ops).toEqual(["prompt-copy", "sfx"]);
  expect(el === undefined ? null : engineState(el)).toBe("live");
  expect(el?.withheld).toEqual(["compose", "plan", "section-edit"].map((op) => ({ op, reason: NO_DESK_PRODUCER })));
  expect(local?.transport).toBe("none");
  expect(local === undefined ? null : engineState(local)).toBe("not-installed");
  expect(local?.ops).toEqual([]);
  expect(local?.needs?.length).toBeGreaterThan(0);
  // Who makes what on the desk: Suno songs; ElevenLabs effects, as the sfx producer's batch (L66).
  expect(makersOf(on, "music").map((e) => e.id)).toEqual(["suno"]);
  expect(makersOf(on, "sfx").map((e) => e.id)).toEqual(["elevenlabs"]);

  // A capability switched off: the op keeps its place, now with the deployment's reason verbatim.
  const noSfx = engineById(engineRegistry({ musicSectionEdit: true, musicSfx: false }), "elevenlabs");
  expect(noSfx?.withheld.find((w) => w.op === "sfx")).toEqual({ op: "sfx", reason: ABSENCE_REASON.musicSfx });
  const off = engineById(engineRegistry({ musicSectionEdit: false, musicSfx: false }), "elevenlabs");
  expect(off?.withheld.find((w) => w.op === "compose")).toEqual({ op: "compose", reason: ABSENCE_REASON.musicSectionEdit });
});

/* ── 2 · the edit ────────────────────────────────────────────────────── */

test("edit: kept sections reference the source's ranges; regenerated ones carry the mode", () => {
  const plan = buildEditPlan(PLAN, "song_src", ["keep", "medium", "free", "keep"], ["a", "pulse, harder", "drop, wider", "d"]);
  const [k1, g2, g3, k4] = plan.chunks;
  console.log(`[desk] edit plan ${JSON.stringify(plan.chunks.map((c) => ("song_id" in c && !("text" in c) ? "ref" : "gen")))}`);
  expect(k1).toEqual({ song_id: "song_src", range: { start_ms: 0, end_ms: 6000 } });
  expect((g2 as WireGenerationChunk).text).toBe("pulse, harder");
  expect((g2 as WireGenerationChunk).conditioning_ref).toEqual({ song_id: "song_src", range: { start_ms: 6000, end_ms: 14000 } });
  expect((g2 as WireGenerationChunk).condition_strength).toBe("medium");
  expect((g3 as WireGenerationChunk).conditioning_ref).toBeUndefined();
  expect((g3 as WireGenerationChunk).duration_ms).toBe(10000);
  expect(k4 as WireAudioRefChunk).toEqual({ song_id: "song_src", range: { start_ms: 24000, end_ms: 30000 } });
  // Only the regenerated seconds are new audio.
  expect(editSeconds(PLAN, ["keep", "medium", "free", "keep"])).toBe(18);
  expect(editSeconds(PLAN, ["keep", "keep", "keep", "keep"])).toBe(0);
});
