// THE GROWN SCORE SPEC (spark audio-agent-studio, stage S2): up to 8 tracks over the studio's 7 roles,
// a role repeated only with ids, `enters` per section, the catalog-role map shared with the Python
// renderer, and the pure track edits the local band's verbs file new takes from.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { mixScoreTracks, rewriteScoreTrack } from "../src/audio.score.edit.ts";
import {
  INSTRUMENT_CATALOG,
  SCORE_MAX_TRACKS,
  SCORE_ROLES,
  SCORE_ROLE_COMPAT,
  parseScoreSpec,
  readyInstrumentsForRole,
  swapRoleInstrument,
  swapTrackInstrument,
  trackIdOf,
  withTrackIds,
  type ScoreSpec,
  type ScoreTrack,
} from "../src/audio.score.ts";
import { FULL_BAND_SPEC, WORKED_SCORE_TEMPLATES, compileSeedToScore, templateById } from "../src/audio.score.templates.ts";
import { STUDIO_ROLES } from "../src/audio.studio.kinds.ts";
import { parseJsonAt } from "../src/door.ts";

const base = (): ScoreSpec => templateById("chill-hiphop").spec;
const withTracks = (tracks: readonly Partial<ScoreTrack>[]): unknown => ({ ...base(), tracks });
const refusal = (input: unknown): string => {
  const r = parseScoreSpec(input);
  return r.ok ? "accepted" : r.error.message;
};

describe("score roles and the shared role map", () => {
  it("takes its roles from the studio's one list", () => {
    expect(SCORE_ROLES).toBe(STUDIO_ROLES);
  });

  it("mirrors audio.roles.json, the file the Python renderer reads", () => {
    const file = parseJsonAt("audio.roles.json", z.object({ compat: z.record(z.string(), z.array(z.string())) }), readFileSync(new URL("../src/audio.roles.json", import.meta.url), "utf8"));
    if (!file.ok) throw new Error(file.error.message);
    expect(SCORE_ROLE_COMPAT).toEqual(file.value.compat);
    expect(Object.keys(file.value.compat).sort()).toEqual([...SCORE_ROLES].sort());
  });

  it("offers a pad the chords instruments and a texture the leads and chords", () => {
    const ids = (role: (typeof SCORE_ROLES)[number]) => readyInstrumentsForRole(role).map((i) => i.id);
    expect(ids("pad")).toEqual(ids("chords"));
    expect(ids("percussion")).toEqual(ids("drums"));
    expect(new Set(ids("texture"))).toEqual(new Set([...ids("lead"), ...ids("chords")]));
    expect(ids("pad")).not.toContain("minigrand-vst3");
  });
});

describe("a v1 document", () => {
  it("validates exactly as written (no id, no enters added)", () => {
    for (const t of WORKED_SCORE_TEMPLATES) {
      const r = parseScoreSpec(t.spec);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual(t.spec);
    }
  });

  it("compiles from a seed with one track per role and no ids", () => {
    const spec = compileSeedToScore({ genres: ["lofi"], instruments: ["felt piano"] }, { title: "x" });
    expect(spec.tracks.map((t) => t.role)).toEqual(["drums", "bass", "chords", "lead"]);
    expect(spec.tracks.some((t) => "id" in t)).toBe(false);
    expect(spec.tracks.find((t) => t.role === "chords")?.instrument).toBe("sample-felt-piano");
  });

  it("still refuses version 2", () => {
    expect(refusal({ ...base(), v: 2 })).toMatch(/^score spec: v/);
  });
});

describe("tracks: ids, repeated roles, the cap", () => {
  it("accepts the full band: 8 tracks, two leads by id, pad, percussion, texture, enters", () => {
    const r = parseScoreSpec(FULL_BAND_SPEC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tracks.length).toBe(SCORE_MAX_TRACKS);
    expect(r.value.tracks.map(trackIdOf)).toEqual(["drums", "percussion", "bass", "chords", "pad", "lead-bell", "lead-guitar", "texture"]);
  });

  it("refuses a ninth track", () => {
    const nine = Array.from({ length: SCORE_MAX_TRACKS + 1 }, (_, i) => ({ role: "lead" as const, id: `lead-${i}`, instrument: "sample-ikembe-bell" }));
    expect(refusal(withTracks(nine))).toMatch(/^score spec: tracks/);
  });

  it("refuses a repeated role unless every track of it has an id, naming the later track", () => {
    const two = [{ role: "drums" as const, instrument: "kit-808-warm" }, { role: "drums" as const, instrument: "kit-909-pulse" }];
    expect(refusal(withTracks(two))).toMatch(/^score spec: tracks\.1\.role: duplicate role drums \(tracks\.0 too\)/);
    expect(refusal(withTracks([two[0]!, { ...two[1]!, id: "kit-b" }]))).toMatch(/^score spec: tracks\.1\.role/);
    expect(refusal(withTracks([{ ...two[0]!, id: "kit-a" }, two[1]!]))).toMatch(/^score spec: tracks\.1\.role/);
    expect(refusal(withTracks([{ ...two[0]!, id: "kit-a" }, { ...two[1]!, id: "kit-b" }]))).toBe("accepted");
  });

  it("refuses a duplicate id, an id that takes another track's role name, and a malformed id", () => {
    const lead = { role: "lead" as const, instrument: "sample-ikembe-bell" };
    expect(refusal(withTracks([{ ...lead, id: "hook" }, { ...lead, id: "hook" }]))).toMatch(/^score spec: tracks\.1\.id: track id hook is already tracks\.0's/);
    expect(refusal(withTracks([lead, { role: "chords", id: "lead", instrument: "sample-felt-piano" }]))).toMatch(/^score spec: tracks\.1\.id/);
    expect(refusal(withTracks([{ ...lead, id: "Lead 2" }]))).toMatch(/^score spec: tracks\.0\.id/);
    expect(refusal(withTracks([{ ...lead, id: "x".repeat(25) }]))).toMatch(/^score spec: tracks\.0\.id/);
  });
});

describe("tracks: instrument fit and enters", () => {
  it("lets each role play only its mapped catalog roles", () => {
    expect(refusal(withTracks([{ role: "pad", instrument: "vital-warm-pad" }]))).toBe("accepted");
    expect(refusal(withTracks([{ role: "texture", instrument: "vital-glass-lead" }]))).toBe("accepted");
    expect(refusal(withTracks([{ role: "texture", instrument: "sample-felt-piano" }]))).toBe("accepted");
    expect(refusal(withTracks([{ role: "percussion", instrument: "kit-909-pulse" }]))).toBe("accepted");
    expect(refusal(withTracks([{ role: "pad", instrument: "vital-pluck-lead" }]))).toMatch(/^score spec: tracks\.0\.instrument: vital-pluck-lead is for lead, not pad \(a pad track takes chords instruments\)/);
    expect(refusal(withTracks([{ role: "percussion", instrument: "vital-sub-bass" }]))).toMatch(/^score spec: tracks\.0\.instrument/);
    expect(refusal(withTracks([{ role: "pad", instrument: "minigrand-vst3" }]))).toMatch(/silent/);
  });

  it("holds pitched roles to the key and lets a kit play any note", () => {
    const off = [{ bar: 1, beat: 0, durationBeats: 1, midi: 61, velocity: 90 }];
    expect(refusal(withTracks([{ role: "pad", instrument: "vital-warm-pad", notes: off }]))).toMatch(/^score spec: tracks\.0\.notes\.0\.midi: 61 \(C#4\) leaves declared key A minor/);
    expect(refusal(withTracks([{ role: "percussion", instrument: "kit-909-pulse", notes: off }]))).toBe("accepted");
  });

  it("wants one enters flag per section and a track that plays somewhere", () => {
    const pad = { role: "pad" as const, instrument: "vital-warm-pad" };
    expect(refusal(withTracks([{ ...pad, enters: [true, false] }]))).toMatch(/^score spec: tracks\.0\.enters: 2 flags for 3 sections/);
    expect(refusal(withTracks([{ ...pad, enters: [false, false, false] }]))).toMatch(/^score spec: tracks\.0\.enters: the track plays in no section/);
    expect(refusal(withTracks([{ ...pad, enters: [true, false, true] }]))).toBe("accepted");
  });

  it("writes all-true enters as no enters (one spelling, one stem hash)", () => {
    const r = parseScoreSpec(withTracks([{ role: "pad", instrument: "vital-warm-pad", enters: [true, true, true] }]));
    expect(r.ok).toBe(true);
    if (r.ok) expect("enters" in r.value.tracks[0]!).toBe(false);
  });
});

describe("swaps and ids", () => {
  it("swaps one track by id, refuses an unknown id, and keeps the role swap for one-per-role takes", () => {
    const byId = swapTrackInstrument(FULL_BAND_SPEC, "lead-guitar", "vital-glass-lead");
    expect(byId.ok).toBe(true);
    if (byId.ok) {
      expect(byId.value.tracks.find((t) => t.id === "lead-guitar")?.instrument).toBe("vital-glass-lead");
      expect(byId.value.tracks.find((t) => t.id === "lead-bell")?.instrument).toBe("sample-ikembe-bell");
    }
    const unknown = swapTrackInstrument(FULL_BAND_SPEC, "lead-3", "vital-glass-lead");
    expect(unknown.ok ? "" : unknown.error.message).toMatch(/no track lead-3 \(tracks: drums, percussion/);
    const ambiguous = swapRoleInstrument(FULL_BAND_SPEC, "lead", "vital-glass-lead");
    expect(ambiguous.ok ? "" : ambiguous.error.message).toMatch(/role lead has 2 tracks \(lead-bell, lead-guitar\) - swap one by its track id/);
    const v1 = swapRoleInstrument(base(), "lead", "vital-glass-lead");
    expect(v1.ok && v1.value.tracks.find((t) => t.role === "lead")?.instrument).toBe("vital-glass-lead");
  });

  it("gives ids only to a role that repeats, never reusing a taken one", () => {
    const one = base().tracks;
    expect(withTrackIds(one)).toEqual(one);
    const repeated = withTrackIds([...one, { role: "lead", instrument: "sample-mallet-guitar" }, { role: "lead", id: "lead-1", instrument: "vital-glass-lead" }]);
    expect(repeated.map(trackIdOf)).toEqual(["drums", "bass", "chords", "lead-2", "lead-3", "lead-1"]);
    expect(parseScoreSpec({ ...base(), tracks: repeated }).ok).toBe(true);
  });
});

describe("track edits", () => {
  it("remixes by id and says what changed", () => {
    const r = mixScoreTracks(FULL_BAND_SPEC, { "lead-bell": { gainDb: -6, pan: 0.3 }, pad: { muted: true, enters: [true, true, true] } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.diff).toEqual(["lead-bell: gainDb -3.5 -> -6", "lead-bell: pan 0.15 -> 0.3", "pad: muted default -> true", "pad: enters on/on/rest -> on/on/on"]);
    const pad = r.value.spec.tracks.find((t) => t.role === "pad")!;
    expect(pad.muted).toBe(true);
    expect("enters" in pad).toBe(false);
    expect(r.value.spec.tracks.filter((t) => t.role !== "pad" && t.id !== "lead-bell")).toEqual(FULL_BAND_SPEC.tracks.filter((t) => t.role !== "pad" && t.id !== "lead-bell"));
  });

  it("refuses an empty mix, an unknown track, and an out-of-range level with its path", () => {
    expect(mixScoreTracks(FULL_BAND_SPEC, {}).ok).toBe(false);
    const unknown = mixScoreTracks(FULL_BAND_SPEC, { lead: { gainDb: -3 } });
    expect(unknown.ok ? "" : unknown.error.message).toMatch(/no track lead \(tracks:/);
    const loud = mixScoreTracks(FULL_BAND_SPEC, { pad: { gainDb: 40 } });
    expect(loud.ok ? "" : loud.error.message).toMatch(/^score spec: tracks\.4\.gainDb/);
  });

  it("rewrites one track's notes (keeping its pattern) or its pattern (dropping written notes)", () => {
    const notes = [{ bar: 2, beat: 0, durationBeats: 1, midi: 69, velocity: 90 }];
    const written = rewriteScoreTrack(FULL_BAND_SPEC, "lead-guitar", { notes });
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(written.value.spec.tracks.find((t) => t.id === "lead-guitar")?.notes).toEqual(notes);
    expect(written.value.diff).toEqual(["lead-guitar: 0 written notes -> 1"]);
    const back = rewriteScoreTrack(written.value.spec, "lead-guitar", { pattern: "plucked-hook" });
    expect(back.ok).toBe(true);
    if (back.ok) {
      const t = back.value.spec.tracks.find((x) => x.id === "lead-guitar")!;
      expect(t.pattern).toBe("plucked-hook");
      expect("notes" in t).toBe(false);
      expect(back.value.diff).toEqual(["lead-guitar: pattern default (written notes) -> plucked-hook"]);
    }
  });

  it("refuses an empty rewrite and an out-of-key note with its path", () => {
    expect(rewriteScoreTrack(FULL_BAND_SPEC, "pad", { notes: [] }).ok).toBe(false);
    const off = rewriteScoreTrack(FULL_BAND_SPEC, "pad", { notes: [{ bar: 1, beat: 0, durationBeats: 2, midi: 61, velocity: 80 }] });
    expect(off.ok ? "" : off.error.message).toMatch(/^score spec: tracks\.4\.notes\.0\.midi: 61 \(C#4\)/);
  });
});

it("keeps every catalog instrument on a catalog role", () => {
  for (const i of INSTRUMENT_CATALOG) expect(["drums", "bass", "chords", "lead"]).toContain(i.role);
});
