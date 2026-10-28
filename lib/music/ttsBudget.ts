// THE SPEECH CEILING - characters of text sent to ElevenLabs text-to-speech, held before the
// vendor is touched (lib/music/elevenlabs.ts `speak`), settled when it answers, released when it
// rendered nothing it bills. The class is `tts-chars` (lib/spend/classes.ts), on the same kernel
// meter imaging, video and music share - this file is only its vocabulary.
//
// WHY CHARACTERS (operator decision, 2026-10-24): the vendor bills speech per character of the
// request's text, and the character count is exact before the call. Music's ceiling is seconds of
// audio because seconds are the one exact link of its chain; here the exact link is the text, so
// the ceiling counts that, and the dollars are a pure function of it (the price table's row).
//
// WHICH FAILURES ARE BOOKED follows lib/music/elevenlabs.ts `BILLED_ON_FAILURE`: a timeout or an
// unreadable body means the vendor synthesised and will bill; a refusal, a rate limit or a
// rejected key cost nothing and are released.
//
// Server only, as the rest of lib/music: the lines it writes carry numbers, env-var NAMES and
// the model, never the text being spoken.

import { SPEND_CLASSES } from "../spend/classes";
import { createMeter, type MeterStats } from "../spend/meter";
import { spendStoreFor } from "../spend/select";
import { MusicError } from "./errors";
import type { MusicCostBasis } from "./pricing";

const CLASS = SPEND_CLASSES["tts-chars"];

export const TTS_BUDGET_VAR = CLASS.ceilingVar;
export const TTS_WINDOW_VAR = CLASS.windowVar;

export type TtsSpendEntry = {
  readonly characters: number;
  readonly model: string;
  readonly voice: string;
  readonly outcome: "served" | "failed";
  readonly basis: MusicCostBasis;
  readonly at?: number;
};

type TtsAxes = { op: "tts"; model: string; voice: string };

const note = (line: string): void => console.log(`[music] tts-budget ${line}`);

const meter = createMeter<TtsSpendEntry, TtsAxes, MusicCostBasis>(
  CLASS,
  {
    entry: (e) => ({ amount: e.characters, outcome: e.outcome, basis: e.basis, axes: { op: "tts", model: e.model, voice: e.voice }, at: e.at }),
    refuse: ({ amount, spent, held, ceiling, windowMs, refusals }) => {
      note(`refused pending=${amount} spent=${spent} held=${held} ceiling=${ceiling} windowMs=${windowMs} refusals=${refusals}`);
      return new MusicError(
        "over-budget",
        `Speech ceiling reached: this line is ${amount} characters and ${spent + held} have been spoken or are in flight in the last ~${Math.round(windowMs / 60000)} min, which would exceed the ${ceiling}-character ceiling (${TTS_BUDGET_VAR}). Refused before the vendor was called, so nothing was billed.`,
      );
    },
    invalid: (amount) => new MusicError("bad-request", `Speech spend cannot be reserved: ${String(amount)} characters is not a finite non-negative count.`),
    busy: (message) => new MusicError("timeout", `Speech spend could not be reserved. ${message}`),
    evicted: ({ dropped, droppedAmount, remaining, windowMs }) => note(`window-reset evicted=${dropped} chars=${droppedAmount} remaining=${remaining} windowMs=${windowMs}`),
  },
  spendStoreFor(CLASS.id),
);

export type TtsHold = { readonly id: string; readonly amount: number };

/** Hold `characters` for a line about to be spoken; `over-budget` (402) before the vendor is touched. */
export async function reserveTts(characters: number, now: number = Date.now()): Promise<TtsHold> {
  const h = await meter.reserve(characters, now);
  return { id: h.id, amount: h.amount };
}

/** Replace the hold with what the vendor will bill. */
export function settleTts(hold: TtsHold, entry: TtsSpendEntry): Promise<void> {
  return meter.settle(hold, entry);
}

/** Drop a hold: the vendor rendered nothing it bills. A settled hold is a no-op. */
export function releaseTts(hold: TtsHold): Promise<void> {
  return meter.release(hold);
}

export function ttsBudgetStats(now: number = Date.now()): Promise<MeterStats> {
  return meter.stats(now);
}

/** Test hook - clear the window, the holds and the counters. */
export function __resetTtsBudget(): void {
  meter.reset();
}
