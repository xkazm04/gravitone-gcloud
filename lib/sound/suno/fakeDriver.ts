// THE FAKE SUNO DRIVER — selected by SUNO_DRIVER=fake (lib/sound/suno/queue.ts).
// Server-only by use. Deterministic: the five phases in order, a short
// configurable delay between them, and two clip references per create whose
// song ids are counted, not random, so a probe can name them.
//
// It touches no browser, no network and no vendor. `FAKE_SUNO` is the probe's
// handle: its health, a failure to throw for a given create, the delay, and a
// log of every create it was asked for.

import type { SunoClipRef, SunoDriverHealth, SunoFields, SunoModel, SunoPhase } from "@/lib/suno/types";

const PHASES: readonly SunoPhase[] = ["attaching", "composing", "creating", "rendering", "collecting"];

export interface FakeSunoControl {
  /** Milliseconds between phases. */
  delayMs: number;
  health: SunoDriverHealth;
  /** Return a message to make this create throw it, verbatim. */
  failWith: (fields: SunoFields, model: SunoModel) => string | null;
  /** Every create, in call order. */
  calls: { style: string; model: SunoModel }[];
  /** Hold every create at "creating" until this resolves (crash-resume probes). */
  hold: Promise<void> | null;
  seq: number;
}

export const FAKE_SUNO: FakeSunoControl = {
  delayMs: 1,
  health: { ok: true },
  failWith: () => null,
  calls: [],
  hold: null,
  seq: 0,
};

export function resetFakeSuno(): void {
  FAKE_SUNO.delayMs = 1;
  FAKE_SUNO.health = { ok: true };
  FAKE_SUNO.failWith = () => null;
  FAKE_SUNO.calls = [];
  FAKE_SUNO.hold = null;
  FAKE_SUNO.seq = 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fakeProbeSuno(): Promise<SunoDriverHealth> {
  return FAKE_SUNO.health;
}

export async function fakeCreateSunoTracks(fields: SunoFields, model: SunoModel, onPhase: (phase: SunoPhase) => void): Promise<SunoClipRef[]> {
  FAKE_SUNO.calls.push({ style: fields.style, model });
  for (const phase of PHASES) {
    onPhase(phase);
    if (phase === "creating") {
      const fail = FAKE_SUNO.failWith(fields, model);
      if (fail) throw new Error(fail);
      if (FAKE_SUNO.hold) await FAKE_SUNO.hold;
    }
    await sleep(FAKE_SUNO.delayMs);
  }
  return [0, 1].map((i) => {
    const songId = `fake-${String(++FAKE_SUNO.seq).padStart(4, "0")}`;
    return {
      songId,
      url: `https://suno.com/song/${songId}`,
      // Even = streamable, odd = not exposed yet: both shapes reach the canvas.
      audioUrl: i === 0 ? `https://cdn1.suno.ai/${songId}.mp3` : null,
      imageUrl: null,
      title: `${fields.title ?? fields.style.split(",")[0]} (${model}${i ? " b" : ""})`,
      durationS: i === 0 ? 120 : null,
    };
  });
}
