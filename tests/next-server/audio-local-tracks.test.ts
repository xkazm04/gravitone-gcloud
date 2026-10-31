// THE LOCAL BAND'S TRACKS (spark audio-agent-studio, stage S2) through the real renderer: a v1 spec still
// renders bit-identically, a remix renders no stem, a rewrite renders exactly one, an `enters` change
// renders exactly that stem, a repeated role renders two distinct stems, the warm worker answers what
// the cold verb does, and a stand-in synth is refused unless the request allows it.
//
// The v1 baseline below was recorded from `sidecar.py render-score` at 84826f76 (before stage S2), on
// the chill-hiphop template with its gainDb / pan removed (a gain or pan moves from the stem bake to the
// mix in S2 - the one recorded stem-sha change - so the bit-identity promise is for a spec without them).

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const osMod = process.getBuiltinModule("node:os");
  const pathMod = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(pathMod.join(osMod.tmpdir(), "gt-local-tracks-test-"));
  process.env["SOUND_STORE_DIR"] = pathMod.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = pathMod.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = pathMod.join(dir, "kernel.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  process.env["SOUND_HUNT_ENGINE"] = "stub";
  return dir;
});

import { existsSync, readFileSync } from "node:fs";

import type { ScoreSpec } from "@gt/domain/audio.score";
import { FULL_BAND_SPEC, templateById } from "@gt/domain/audio.score.templates";
import { GET as takeFile } from "../../app/api/sound/takes/[id]/file/route.ts";
import { ACCESS_SECRET_VAR } from "../../lib/apiAuth.ts";
import { stopWorkers } from "../../lib/audio/renderWorker.ts";
import { renderScore } from "../../lib/audio/sidecar.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { renderLocalScore } from "../../lib/sound/localScore.ts";
import { mixLocalTake, rewriteLocalStem } from "../../lib/sound/localScoreVerbs.ts";
import { filePathAbs } from "../../lib/sound/store.ts";
import { SAMPLES } from "./local-band-samples.ts";

/** sha256 of mix.wav for the gain-free chill-hiphop template, rendered at 84826f76 (deterministic: verified twice). */
const V1_NOGAIN_MIX_SHA = "63acaeb118e2e408b98a4c85bbb9c0da536ea10c555b53d73650cd4148265e89";

const savedSecret = process.env[ACCESS_SECRET_VAR];
process.env[ACCESS_SECRET_VAR] = "tracks-test";

/** GET /api/sound/takes/<id>/file?<query> as a CLI would (the access secret as a header). */
const fileOf = (takeId: string, query: string): Promise<Response> =>
  takeFile(new Request(`http://127.0.0.1:3321/api/sound/takes/${takeId}/file?${query}`, { headers: { authorization: "Bearer tracks-test" } }), {
    params: Promise.resolve({ id: takeId }),
  });
/** The status, with the body read (an unread file stream is closed by the GC, with a warning). */
const statusOf = async (takeId: string, query: string): Promise<number> => {
  const r = await fileOf(takeId, query);
  await r.arrayBuffer();
  return r.status;
};

afterAll(() => {
  if (savedSecret === undefined) delete process.env[ACCESS_SECRET_VAR];
  else process.env[ACCESS_SECRET_VAR] = savedSecret;
  stopWorkers();
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const noGain = (): ScoreSpec => {
  const t = templateById("chill-hiphop").spec;
  return { ...t, tracks: t.tracks.map(({ gainDb: _g, pan: _p, ...rest }) => rest) };
};
const ids = (xs: readonly { readonly id: string }[]): string[] => xs.map((x) => x.id);

describe("local band tracks, rendered", () => {
  it.skipIf(!SAMPLES)("renders a v1 spec bit-identically to before stage S2, warm and cold alike", async () => {
    const warm = await renderLocalScore(noGain(), { verifyDeterminism: false });
    if (!warm.ok) throw new Error(warm.error.message);
    expect(warm.value.plan.mixSha256).toBe(V1_NOGAIN_MIX_SHA);
    expect(ids(warm.value.plan.stems)).toEqual(["drums", "bass", "chords", "lead"]);
    expect(warm.value.plan.stems.every((s) => !s.fallback)).toBe(true);
    // A v1 take's stems are still addressed by role (the route's ?stem=<role> resolves them).
    expect(warm.value.plan.stems.map((s) => s.audioUrl)).toEqual(["drums", "bass", "chords", "lead"].map((r) => `/api/sound/takes/${warm.value.take.id}/file?stem=${r}`));
    expect(await statusOf(warm.value.take.id, "stem=drums")).toBe(200);
    expect(await statusOf(warm.value.take.id, "artifact=midi&stem=lead")).toBe(200);

    const out = mkdtempSync(path.join(os.tmpdir(), "gt-cold-score-"));
    try {
      const cold = await renderScore(noGain(), out);
      if (!cold.ok) throw new Error(cold.error.message);
      expect(cold.value.mixSha256).toBe(V1_NOGAIN_MIX_SHA);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 300_000);

  it.skipIf(!SAMPLES)("renders the full band: a repeated role is two distinct stems, files and URLs by track id", async () => {
    const r = await renderLocalScore(FULL_BAND_SPEC, { verifyDeterminism: false });
    if (!r.ok) throw new Error(r.error.message);
    const { take, plan } = r.value;
    expect(ids(plan.stems)).toEqual(["drums", "percussion", "bass", "chords", "pad", "lead-bell", "lead-guitar", "texture"]);
    expect(plan.stems.every((s) => !s.fallback)).toBe(true);
    const bell = plan.stems.find((s) => s.id === "lead-bell")!;
    const guitar = plan.stems.find((s) => s.id === "lead-guitar")!;
    expect(bell.role).toBe("lead");
    expect(guitar.role).toBe("lead");
    expect(bell.sha256).not.toBe(guitar.sha256);
    expect(bell.fileRel).not.toBe(guitar.fileRel);
    expect(bell.fileRel.endsWith(`${take.id}-lead-bell.wav`)).toBe(true);
    for (const s of plan.stems) expect(existsSync(filePathAbs(s.fileRel)) && existsSync(filePathAbs(s.midiRel))).toBe(true);
    expect(guitar.audioUrl).toBe(`/api/sound/takes/${take.id}/file?stem=lead-guitar`);
    const served = await fileOf(take.id, "stem=lead-guitar");
    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer()).equals(readFileSync(filePathAbs(guitar.fileRel)))).toBe(true);
    expect(await statusOf(take.id, "stem=lead")).toBe(404); // no track is called "lead" here
    expect(await statusOf(take.id, "stem=Lead%20Bell")).toBe(400);
    expect(take.use).toContain("local 8-stem score cue");

    // A remix (level, pan, mute, solo) renders no stem: every one comes back from the cache bit-exact.
    const mixed = await mixLocalTake({ takeId: take.id, tracks: { "lead-bell": { gainDb: -8, pan: -0.4 }, pad: { muted: true }, drums: { solo: false } } });
    if (!mixed.ok) throw new Error(mixed.error.message);
    expect(mixed.value.plan.renderedIds).toEqual([]);
    expect(mixed.value.plan.reusedIds).toEqual(ids(plan.stems));
    expect(mixed.value.plan.stems.map((s) => s.sha256)).toEqual(plan.stems.map((s) => s.sha256));
    expect(mixed.value.plan.stems.map((s) => s.source)).toEqual(plan.stems.map((s) => s.source)); // the true source, on a cache hit too
    expect(mixed.value.plan.mixSha256).not.toBe(plan.mixSha256);
    expect(mixed.value.take.parentId).toBe(take.id);
    expect(mixed.value.take.variation?.diff).toContain("lead-bell: gainDb -3.5 -> -8");

    // A rewrite renders exactly the rewritten stem.
    const notes = [{ bar: 3, beat: 0, durationBeats: 1, midi: 69, velocity: 92 }, { bar: 5, beat: 1, durationBeats: 1.5, midi: 72, velocity: 96 }];
    const rewritten = await rewriteLocalStem({ takeId: mixed.value.take.id, track: "lead-guitar", notes });
    if (!rewritten.ok) throw new Error(rewritten.error.message);
    expect(rewritten.value.plan.renderedIds).toEqual(["lead-guitar"]);
    expect(rewritten.value.plan.reusedIds).toEqual(ids(plan.stems).filter((x) => x !== "lead-guitar"));
    for (const s of rewritten.value.plan.stems) {
      const before = plan.stems.find((p) => p.id === s.id)!;
      if (s.id === "lead-guitar") expect(s.sha256).not.toBe(before.sha256);
      else expect(s.sha256).toBe(before.sha256);
    }

    // Where a track plays (`enters`) changes its notes: exactly that stem renders.
    const moved = await mixLocalTake({ takeId: rewritten.value.take.id, tracks: { pad: { enters: [false, true, true] } } });
    if (!moved.ok) throw new Error(moved.error.message);
    expect(moved.value.plan.renderedIds).toEqual(["pad"]);
    expect(moved.value.plan.reusedIds.length).toBe(7);
  }, 600_000);

  it("refuses a stand-in synth unless the request allows one, naming what is missing", async () => {
    const spec: ScoreSpec = {
      ...noGain(),
      tracks: [
        { role: "drums", instrument: "kit-acoustic-brush" },
        { role: "chords", instrument: "sample-felt-piano" },
      ],
    };
    const nowhere = path.join(ROOT, "no-samples-here");
    const saved = { ab: process.env["GRAVITONE_ABLETON_SAMPLES_DIR"], fl: process.env["GRAVITONE_FL_PACKS_DIR"], cfg: process.env["GRAVITONE_INSTRUMENTS_CONFIG"] };
    process.env["GRAVITONE_ABLETON_SAMPLES_DIR"] = nowhere;
    process.env["GRAVITONE_FL_PACKS_DIR"] = nowhere;
    process.env["GRAVITONE_INSTRUMENTS_CONFIG"] = path.join(ROOT, "no-instruments-config.json");
    const out = mkdtempSync(path.join(os.tmpdir(), "gt-standin-score-"));
    try {
      const refused = await renderScore(spec, out);
      expect(refused.ok).toBe(false);
      if (!refused.ok) {
        expect(refused.error.code).toBe("invalid");
        expect(refused.error.message).toContain("no-samples-here");
      }
      const allowed = await renderScore(spec, out, { allowFallback: true });
      if (!allowed.ok) throw new Error(allowed.error.message);
      expect(allowed.value.stems.every((s) => s.fallback && s.source.startsWith("scipy"))).toBe(true);
    } finally {
      for (const [k, v] of [["GRAVITONE_ABLETON_SAMPLES_DIR", saved.ab], ["GRAVITONE_FL_PACKS_DIR", saved.fl], ["GRAVITONE_INSTRUMENTS_CONFIG", saved.cfg]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      rmSync(out, { recursive: true, force: true });
    }
  }, 300_000);
});
