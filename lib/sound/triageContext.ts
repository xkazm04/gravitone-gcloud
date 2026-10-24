import type { TriageContext } from "@gt/domain/audio.triage";

import { asWirePlan, chunkMs, isGenChunk } from "./editPlan.ts";
import type { SoundTake } from "./types.ts";

// THE BRIEF A TAKE IS TRIAGED AGAINST (spark audio-triage WP3) - what the take COMMITTED to, read
// off the take the sound store holds (lib/sound/store.ts), never off its bytes: the asked length,
// the asked tempo, whether it was briefed as a loop, and the sections of the composition plan the
// provider rendered. A field the take never committed is OMITTED, not nulled, so the sidecar's
// check for it skips (@gt/domain/audio.triage: "verify what was committed and nothing more") and
// the digest of the context (@gt/kernel/library/triage `triageDigest`) does not move when
// nothing was committed.
//
// ONE FUNCTION, TWO READERS: the media-facts job's triage pass (./measureRun.ts `triageTakes`)
// keys a triage by this context's digest, and the Board's audio cull
// (lib/decision/v1/sources/audio.ts) looks the triage up by the same digest. A take whose brief
// changed since its triage therefore shows none until the job has judged it against the new one,
// rather than showing findings against a brief it no longer carries.
//
// Sections come from the plan's chunks laid end to end on the take's clock (./editPlan.ts
// `chunkMs`, the same arithmetic `planMs` sums): a kept range and a generated chunk both occupy
// the file. A chunk's name is its leading `[Name]` tag when it has one (lib/score/takes.ts
// `sectionsOf` reads the same tag), else its 1-based place.

const positive = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > 0;

function sectionsOf(plan: unknown): NonNullable<TriageContext["sections"]> {
  const wire = asWirePlan(plan);
  if (wire === null) return [];
  const out: NonNullable<TriageContext["sections"]> = [];
  let at = 0;
  wire.chunks.forEach((c, i) => {
    const ms = chunkMs(c);
    if (!Number.isFinite(ms) || ms <= 0) return;
    const named = isGenChunk(c) ? /^\[([^\]]+)\]/.exec(c.text)?.[1] : undefined;
    out.push({ name: named ?? String(i + 1), startMs: at, endMs: at + ms });
    at += ms;
  });
  return out;
}

/** The take's brief as the triage reads it; absent keys are briefs the take never made. */
export function triageContextOf(t: Pick<SoundTake, "kind" | "durationS" | "tempoBpm" | "loop" | "plan">): TriageContext {
  const sections = sectionsOf(t.plan);
  return {
    kind: t.kind,
    ...(positive(t.durationS) ? { durationS: t.durationS } : {}),
    ...(positive(t.tempoBpm) ? { tempoBpm: t.tempoBpm } : {}),
    ...(t.loop === null ? {} : { loop: t.loop }),
    ...(sections.length === 0 ? {} : { sections }),
  };
}
