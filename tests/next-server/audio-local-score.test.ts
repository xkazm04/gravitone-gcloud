// LOCAL BAND ENGINE TESTS — closed ScoreSpec validation, A0 instrument gate refusals,
// $0 local receipt door, deterministic VST3/multisample rendering, -14 LUFS mastering,
// 10-detector triage, solo/mute 4-stem cache reuse, and 1-second bit-identical stem swaps.

import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const pathMod = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(pathMod.join(os.tmpdir(), "gt-local-score-test-"));
  process.env["SOUND_STORE_DIR"] = pathMod.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = pathMod.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = pathMod.join(dir, "kernel.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  process.env["SOUND_HUNT_ENGINE"] = "stub";
  return dir;
});

import { parseScoreSpec, type ScoreSpec } from "@gt/domain/audio.score";
import { WORKED_SCORE_TEMPLATES, compileSeedToScore, templateById } from "@gt/domain/audio.score.templates";
import { LocalBandStudio } from "@gt/ui/components/audio/LocalBandStudio.tsx";
import { applyTasteSteer, describeStemChoice, explainScoreChoices, fxChainForPreset, fxPresetOf } from "@gt/ui/components/audio/localBand.ts";
import { readLocalBand } from "../../app/(studio)/audio/_audio/localRead.ts";
import { renderMidi } from "../../lib/audio/sidecar.ts";
import { engineRegistry, engineState } from "../../lib/sound/engines.ts";
import {
  auditionLocalInstrument,
  buildLocalScoreReceipt,
  buildScorePrompt,
  promoteLocalTakeToArrange,
  renderLocalScore,
  swapLocalTakeStem,
} from "../../lib/sound/localScore.ts";
import { filePathAbs } from "../../lib/sound/store.ts";
import { triageContextOf } from "../../lib/sound/triageContext.ts";

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe("Local Band ScoreSpec, $0 Receipt, & A0 Gate", () => {
  it("accepts all 4 worked templates, compiles seed briefs, and prices a $0 local receipt on box.render", () => {
    for (const tpl of WORKED_SCORE_TEMPLATES) {
      const parsed = parseScoreSpec(tpl.spec);
      expect(parsed.ok).toBe(true);
      const receipt = buildLocalScoreReceipt(tpl.spec, { nowMs: 1_760_000_000_000 });
      expect(receipt.ok).toBe(true);
      if (receipt.ok) {
        expect(receipt.value.totals.usd).toBe(0);
        expect(receipt.value.totals.unpriced).toBe(0);
        expect(receipt.value.totals.src).toBe("real");
        expect(receipt.value.lines.length).toBe(4);
        expect(receipt.value.lines.every((l) => l.lane === "box.render" && l.usd === 0 && l.provider === "local")).toBe(true);
      }
    }

    const fromSeed = compileSeedToScore(
      {
        genres: ["synthwave"],
        moods: ["midnight"],
        bpm: 108,
        key: "D minor",
      },
      { title: "Warm synth pulse for midnight coding", loop: true },
    );
    const seedParsed = parseScoreSpec(fromSeed);
    expect(seedParsed.ok).toBe(true);
    if (seedParsed.ok) {
      expect(seedParsed.value.tempoBpm).toBe(108);
      expect(seedParsed.value.key).toBe("D minor");
    }
  });

  it("refuses out-of-range tempo, out-of-key notes, and failed A0 instruments at both spec and receipt doors", () => {
    const base = templateById("chill-hiphop").spec;

    const badBpm = parseScoreSpec({ ...base, tempoBpm: 340 });
    expect(badBpm.ok).toBe(false);
    if (!badBpm.ok) expect(badBpm.error.message).toContain("tempoBpm");

    // A minor has pitch classes A(9), B(11), C(0), D(2), E(4), F(5), G(7). MIDI 61 is C#4 (pc 1).
    const outOfKey: ScoreSpec = {
      ...base,
      tracks: base.tracks.map((t) =>
        t.role === "lead"
          ? { ...t, notes: [{ bar: 1, beat: 0, durationBeats: 1, midi: 61, velocity: 90 }] }
          : t,
      ),
    };
    const badKey = parseScoreSpec(outOfKey);
    expect(badKey.ok).toBe(false);
    if (!badKey.ok) {
      expect(badKey.error.message).toContain("C#4");
      expect(badKey.error.message).toContain("A minor");
    }

    // Silent MiniGrand VST3 must be refused by the A0 gate and by the receipt door.
    const withMiniGrand = {
      ...base,
      tracks: base.tracks.map((t) => (t.role === "chords" ? { ...t, instrument: "minigrand-vst3" } : t)),
    };
    const refusedMini = buildLocalScoreReceipt(withMiniGrand);
    expect(refusedMini.ok).toBe(false);
    if (!refusedMini.ok) {
      expect(refusedMini.error.message).toContain("minigrand-vst3");
      expect(refusedMini.error.message).toContain("silent");
    }

    // Slow/unlicensed Hybrid 3 VST3 must be refused by the A0 gate.
    const withHybrid = {
      ...base,
      tracks: base.tracks.map((t) => (t.role === "lead" ? { ...t, instrument: "hybrid-vst3" } : t)),
    };
    const refusedHybrid = parseScoreSpec(withHybrid);
    expect(refusedHybrid.ok).toBe(false);
    if (!refusedHybrid.ok) {
      expect(refusedHybrid.error.message).toContain("hybrid-vst3");
      expect(refusedHybrid.error.message).toContain("licence");
    }
  });

  it("activates the local engine row in engineRegistry when localRender is live", () => {
    const inactive = engineRegistry({ musicSectionEdit: false, musicSfx: false });
    const localInactive = inactive.find((e) => e.id === "local")!;
    expect(engineState(localInactive)).toBe("not-installed");

    const active = engineRegistry({ musicSectionEdit: false, musicSfx: false, localRender: true });
    const localActive = active.find((e) => e.id === "local")!;
    expect(engineState(localActive)).toBe("live");
    expect(localActive.transport).toBe("api");
    expect(localActive.ops).toEqual(["compose", "section-edit"]);
  });

  it("builds the A2 text-to-score prompt from pipeline/SCORE-PROMPT.md and renders a seamless loop passing loop-seam", async () => {
    const prompt = await buildScorePrompt("Warm lo-fi loop for late night reading");
    expect(prompt).toContain("Warm lo-fi loop for late night reading");
    expect(prompt).toContain("vital-sub-bass");
    expect(prompt).toContain("sample-lofi-keys");
    expect(prompt).toContain("minigrand-vst3");

    const base = templateById("chill-hiphop").spec;
    const loopSpec: ScoreSpec = {
      ...base,
      loop: true,
      sections: [{ name: "loop", bars: 4, energy: 0.85, progression: [0, 5] }],
      tracks: base.tracks.map((t) => (t.role === "bass" ? { ...t, instrument: "sample-mamas-bass" } : t)),
    };
    const loopRes = await renderLocalScore(loopSpec, { verifyDeterminism: false });
    expect(loopRes.ok).toBe(true);
    if (loopRes.ok) {
      expect(loopRes.value.take.loop).toBe(true);
      expect(loopRes.value.plan.triage.flagged).toBe(0);
      const seam = loopRes.value.plan.triage.findings.find((f) => f.check === "loop-seam");
      expect(seam?.verdict).toBe("pass");
      expect(seam?.value ?? 99).toBeLessThan(3);
    }
  }, 60_000);

  it(
    "renders a ScoreSpec deterministically to -14 LUFS, passes all triage detectors, swaps 1 stem while reusing the other 3 bit-for-bit, and remixes solo/mute with 4-stem cache reuse",
    async () => {
      const spec = templateById("chill-hiphop").spec;
      const first = await renderLocalScore(spec, { verifyDeterminism: true });
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const { take, plan } = first.value;
      expect(take.provider).toBe("local");
      expect(take.op).toBe("compose");
      expect(take.measured?.lufs).not.toBeNull();
      expect(Math.abs((take.measured?.lufs ?? 0) - -14.0)).toBeLessThanOrEqual(0.8);
      expect(take.measured?.truePeakDb ?? 0).toBeLessThanOrEqual(-1.0);

      // Bit-identical determinism across double render (including Vital.vst3 + local samples)
      expect(plan.determinism?.bitIdentical).toBe(true);
      expect(plan.determinism?.maxAbsDiff).toBe(0);

      // Zero triage flags across all active checks, including section-boundary and tempo-instability
      expect(plan.triage.flagged).toBe(0);
      const checkIds = plan.triage.findings.filter((c) => c.verdict === "pass").map((c) => c.check);
      expect(checkIds).toContain("tempo-instability");
      expect(checkIds).toContain("section-boundary");

      // triageContextOf(take) derives the exact committed sections from take.plan.chunks
      const ctx = triageContextOf(take);
      expect(ctx.sections?.length).toBe(spec.sections.length);

      // Mix WAV, 4 stem WAVs, per-stem .mid, and REAPER .rpp exist in the sound store
      expect(take.file).not.toBeNull();
      if (take.file) expect(existsSync(filePathAbs(take.file.path))).toBe(true);
      for (const st of plan.stems) {
        expect(existsSync(filePathAbs(st.fileRel))).toBe(true);
        expect(existsSync(filePathAbs(st.midiRel))).toBe(true);
      }
      expect(existsSync(filePathAbs(plan.rppRel))).toBe(true);

      // Swap ONLY the lead stem to sample-mallet-guitar; drums, bass, and chords must be reused bit-for-bit
      const swapped = await swapLocalTakeStem({
        takeId: take.id,
        role: "lead",
        instrumentId: "sample-mallet-guitar",
      });
      expect(swapped.ok).toBe(true);
      if (!swapped.ok) return;

      const nextPlan = swapped.value.plan;
      expect(nextPlan.renderedRoles).toEqual(["lead"]);
      expect(nextPlan.reusedRoles).toEqual(["drums", "bass", "chords"]);

      for (const role of ["drums", "bass", "chords"] as const) {
        const prevStem = plan.stems.find((s) => s.role === role);
        const nextStem = nextPlan.stems.find((s) => s.role === role);
        expect(nextStem?.reused).toBe(true);
        expect(nextStem?.sha256).toBe(prevStem?.sha256);
      }
      const nextLead = nextPlan.stems.find((s) => s.role === "lead");
      const prevLead = plan.stems.find((s) => s.role === "lead");
      expect(nextLead?.instrument).toBe("sample-mallet-guitar");
      expect(nextLead?.sha256).not.toBe(prevLead?.sha256);

      // Soloing the lead stem reuses ALL 4 stems bit-for-bit from cache and remixes in < 1s
      const soloed = await swapLocalTakeStem({
        takeId: swapped.value.take.id,
        role: "lead",
        instrumentId: "sample-mallet-guitar",
        solo: true,
      });
      expect(soloed.ok).toBe(true);
      if (soloed.ok) {
        expect(soloed.value.plan.renderedRoles).toEqual([]);
        expect(soloed.value.plan.reusedRoles).toEqual(["drums", "bass", "chords", "lead"]);
        expect(soloed.value.plan.stems.find((s) => s.role === "lead")?.solo).toBe(true);
      }

      // Promote to Arrangement
      const promoted = await promoteLocalTakeToArrange({
        takeId: swapped.value.take.id,
        group: "hip hop",
        label: "midnight-study-guitar",
        finalize: true,
      });
      expect(promoted.ok).toBe(true);
      if (promoted.ok) {
        expect(promoted.value.verdict).toBe("kept");
        expect(promoted.value.stage).toBe("finalized");
      }
    },
    120_000,
  );

  it("renders instrument audition previews, renders SMF .mid files via renderMidi, and refuses failed A0 instruments", async () => {
    const refused = await auditionLocalInstrument("minigrand-vst3");
    expect(refused.ok).toBe(false);

    const okAudition = await auditionLocalInstrument("sample-felt-piano");
    expect(okAudition.ok).toBe(true);
    if (okAudition.ok) {
      expect(okAudition.value.audition.truePeakDb ?? -99).toBeGreaterThan(-40);
      expect(okAudition.value.audioUrl).toContain("instrument=sample-felt-piano");
      expect(existsSync(path.join(ROOT, "sound", "files", "audition-sample-felt-piano.wav"))).toBe(true);
    }

    const view = await readLocalBand();
    const leadStem = view.takes[0]?.stems.find((s) => s.role === "lead");
    expect(leadStem).toBeDefined();
    const midiFiles = existsSync(path.join(ROOT, "sound", "files"));
    expect(midiFiles).toBe(true);
    const outMidiWav = path.join(ROOT, "rendered-midi-stem.wav");
    const firstTakeId = view.takes[0]!.id;
    const midiPath = path.join(ROOT, "sound", "files", `${firstTakeId}-lead.mid`);
    const midiRes = await renderMidi(midiPath, "sample-mallet-guitar", outMidiWav);
    expect(midiRes.ok).toBe(true);
    if (midiRes.ok) {
      expect(midiRes.value.id).toBe("sample-mallet-guitar");
      expect(midiRes.value.noteCount).toBeGreaterThan(0);
      expect(midiRes.value.measure.integratedLufs).not.toBeNull();
      expect(existsSync(outMidiWav)).toBe(true);
    }
    const refusedMidi = await renderMidi(midiPath, "minigrand-vst3", outMidiWav);
    expect(refusedMidi.ok).toBe(false);
    if (!refusedMidi.ok) expect(refusedMidi.error.message).toContain("silent");
  }, 60_000);

  it("renders LocalBandStudio over readLocalBand() with taste steering, solo/mute, fx presets, receipt door, and arrangement breakdown", async () => {
    const view = await readLocalBand();
    expect(view.templates.length).toBe(4);
    expect(view.catalog.length).toBe(16);
    expect(view.takes.length).toBeGreaterThanOrEqual(2);

    const chorusChain = fxChainForPreset("wide-chorus");
    expect(fxPresetOf(chorusChain)).toBe("wide-chorus");
    const breakdown = explainScoreChoices(view.templates[0]!.spec, view.catalog, view.takes[0]);
    expect(breakdown.length).toBe(4);

    const steered = applyTasteSteer(
      view.templates[0]!.spec,
      { drums: "kit-808-warm", bass: "vital-sub-bass", chords: "sample-lofi-keys", lead: "sample-ikembe-bell" },
      "softer-voice",
    );
    expect(steered.swapChoice.drums).toBe("kit-acoustic-brush");
    expect(steered.swapChoice.chords).toBe("sample-felt-piano");
    expect(steered.summary).toContain("1–4 kHz");

    const swapDesc = describeStemChoice("vital-pluck-lead", view.takes[0]!.stems.find((s) => s.role === "lead") ?? null, view.catalog);
    expect(swapDesc.tone).toBe("cyan");
    expect(swapDesc.text).toContain("bit-identical");

    const refusedDesc = describeStemChoice("minigrand-vst3", null, view.catalog);
    expect(refusedDesc.tone).toBe("rose");
    expect(refusedDesc.text).toContain("silent");

    const html = renderToStaticMarkup(
      h(LocalBandStudio, {
        templates: view.templates,
        catalog: view.catalog,
        takes: view.takes,
        onRender: () => {},
        onReceipt: () => {},
        onSwapStem: () => {},
        onAudition: () => {},
        onPromote: () => {},
      }),
    );
    expect(html).toContain("local band · 4-stem studio");
    expect(html).toContain("Receipt ($0)");
    expect(html).toContain("softer under voiceover");
    expect(html).toContain("Chill Lo-Fi Groove");
    expect(html).toContain("reused bit-exact");
    expect(html).toContain("mute drums stem");
    expect(html).toContain("solo drums stem");
    expect(html).toContain("REAPER .rpp");
    expect(html).toContain("AIR MiniGrand VST3");
    expect(html).toContain("instrument render is silent");
    expect(html).toContain("AIR Hybrid 3 VST3");
  });
});
