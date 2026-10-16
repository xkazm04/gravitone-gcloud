// THE FAKE SUNO DRIVER — selected by SUNO_DRIVER=fake (lib/sound/suno/queue.ts
// `sunoDriver`, still read by the library import) or bound to a drive
// (lib/producers/suno.ts `sunoProducer({ driver })`). Its clip shape is also the
// DRY stand-in a dry Suno job continues on (`standClipRefs`). Server-only by use. Deterministic: the five phases in order, a short
// configurable delay between them, and two clip references per create whose
// song ids are counted, not random, so a probe can name them.
//
// It touches no browser, no network and no vendor. `FAKE_SUNO` is the probe's
// handle: its health, a failure to throw for a given create, the delay, a log
// of every create it was asked for, and the library listSunoLibrary answers.

import type { SunoClipRef, SunoDriverHealth, SunoFields, SunoLibraryClip, SunoModel, SunoPhase } from "@/lib/suno/types";

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
  /** What listSunoLibrary answers, in order (newest first, as Suno lists). */
  library: SunoLibraryClip[];
  /** How many times the library was listed. */
  libraryReads: number;
}

/** The fake library: two hand-made songs and one that shares its song id with
 *  the FIRST clip a fake create mints (`fake-0001`), so a probe can show a
 *  queue-made clip is not imported twice. */
export function fakeLibrary(): SunoLibraryClip[] {
  const at = Date.parse("2026-10-01T12:00:00.000Z");
  const song = (songId: string, i: number, prompt: SunoFields, model: string, audio: boolean): SunoLibraryClip => ({
    songId,
    url: `https://suno.com/song/${songId}`,
    audioUrl: audio ? `https://cdn1.suno.ai/${songId}.m4a` : null,
    imageUrl: `https://cdn2.suno.ai/image_large_${songId}.jpeg`,
    title: prompt.title ?? "",
    durationS: audio ? 180 + i : null,
    model,
    prompt,
    createdAt: at - i * 60_000,
  });
  return [
    song("lib-0001", 0, { title: "The Shape of Leaving", style: "trip-hop, grunge, cello, male vocal", lyrics: "[Verse 1]\nYou left the kettle cold again" }, "v6", true),
    song("lib-0002", 1, { style: "roots dub, melodica, tape echo", lyrics: "[Instrumental]", exclude: "vocals" }, "v4.5", true),
    song("fake-0001", 2, { title: "Gravitone probe", style: "warm synthwave, analog pads" }, "v6-wild", false),
  ];
}

export const FAKE_SUNO: FakeSunoControl = {
  delayMs: 1,
  health: { ok: true },
  failWith: () => null,
  calls: [],
  hold: null,
  seq: 0,
  library: fakeLibrary(),
  libraryReads: 0,
};

export function resetFakeSuno(): void {
  FAKE_SUNO.delayMs = 1;
  FAKE_SUNO.health = { ok: true };
  FAKE_SUNO.failWith = () => null;
  FAKE_SUNO.calls = [];
  FAKE_SUNO.hold = null;
  FAKE_SUNO.seq = 0;
  FAKE_SUNO.library = fakeLibrary();
  FAKE_SUNO.libraryReads = 0;
}

export async function fakeListSunoLibrary(onPage?: (n: number, total: number | null) => void): Promise<SunoLibraryClip[]> {
  FAKE_SUNO.libraryReads++;
  await sleep(FAKE_SUNO.delayMs);
  onPage?.(FAKE_SUNO.library.length, null);
  return FAKE_SUNO.library.map((c) => ({ ...c, prompt: { ...c.prompt } }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fakeProbeSuno(): Promise<SunoDriverHealth> {
  return FAKE_SUNO.health;
}

/** What a DRY create continues on (kernel dryrun `stand`): two references in
 *  the fake's shape, marked so no one mistakes them for songs on suno.com. */
export function standClipRefs(fields: SunoFields, model: SunoModel): SunoClipRef[] {
  const tag = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  return [0, 1].map((i) => ({
    songId: `dry-${tag}-${model}-${i}`,
    url: `https://suno.com/song/dry-${tag}-${model}-${i}`,
    audioUrl: null,
    imageUrl: null,
    title: `${fields.title ?? fields.style.split(",")[0]} (dry run, ${model}${i ? " b" : ""})`,
    durationS: null,
  }));
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
