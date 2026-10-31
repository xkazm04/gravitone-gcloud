// LOCAL PREVIEWS (lib/sound/audioPreview.ts) over a fake library tree in a temp root, so the scoring
// rules are pinned without this machine's real libraries: a noise file, a convolution impulse response
// and a loop named "box" must never outrank the instrument a non-musician asked to hear, and an
// unmatched sound answers null, not a near miss. Ported from hackathon audio-steer-1028 entry e4 onto
// the studio's one sample-library setting, GRAVITONE_SAMPLE_ROOTS (lib/audio/atlas.ts SAMPLE_ROOTS_ENV).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SAMPLE_ROOTS_ENV } from "../../lib/audio/atlas.ts";
import { previewFor, sampleRoots } from "../../lib/sound/audioPreview.ts";

const ROOT = mkdtempSync(path.join(tmpdir(), "gt-audio-preview-"));
const file = (rel: string): string => {
  const at = path.join(ROOT, rel);
  mkdirSync(path.dirname(at), { recursive: true });
  writeFileSync(at, "");
  return at;
};

const FELT = file("Instruments/Keyboard/Felt Piano Note.wav");
file("Instruments/Keyboard/Upright Piano Keys Clacking Noises.aif");
const KIT = file("Drums/Soft Kit.wav");
file("Builtin/Hybrid/ImpulseResponses/Hybrid_Made_for_Drums_Percussions.wav");
const BOX = file("Instruments/Celesta Music Box.wav");
file("Loops/DL Hop Box.wav");
const STABS = file("Loops/Grand Piano Dirty Stabs.wav");
const PIANO = file("Instruments/Keyboard/Grand Piano Note.wav");

const before = process.env[SAMPLE_ROOTS_ENV];
process.env[SAMPLE_ROOTS_ENV] = [ROOT, path.join(ROOT, "no-such-folder")].join(path.delimiter);
afterAll(() => {
  if (before === undefined) delete process.env[SAMPLE_ROOTS_ENV];
  else process.env[SAMPLE_ROOTS_ENV] = before;
  rmSync(ROOT, { recursive: true, force: true });
});

describe("audio previews over a fake library", () => {
  it("reads the studio's one sample-roots setting, keeping only roots that exist", () => {
    expect(SAMPLE_ROOTS_ENV).toBe("GRAVITONE_SAMPLE_ROOTS");
    expect(sampleRoots()).toEqual([ROOT]);
  });

  it("a piano preview is a piano note, not key-clacking noise", () => {
    expect(previewFor(["felt", "piano", "keys"], "lead")).toBe(FELT);
    expect(previewFor(["piano", "grand"], "lead")).toBe(PIANO);
  });

  it("a drum preview is a kit, not a convolution impulse response", () => {
    expect(previewFor(["drums", "kit", "percussion"], "pulse")).toBe(KIT);
  });

  it("a music box is the celesta file, not a loop with box in its name", () => {
    expect(previewFor(["musicbox", "music box", "celesta"], "air")).toBe(BOX);
  });

  it("a sound the library does not hold answers null", () => {
    expect(previewFor(["didgeridoo"], "lead")).toBeNull();
  });

  it("never repeats a preview file the caller has already handed out", () => {
    const first = previewFor(["piano", "grand"], "lead");
    expect(first).toBe(PIANO);
    const second = previewFor(["piano", "grand"], "lead", new Set(first ? [first] : []));
    expect(second).not.toBe(first);
    // The next-best grand piano in the tree, not the same file again.
    expect(second).toBe(STABS);
  });
});
