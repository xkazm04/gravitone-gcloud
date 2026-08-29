"use client";

// SCORE / SPOTTING SESSION — the winner. Music against picture: scenes run
// along the clock, cues are spans drawn under them to scale, and clicking a
// span reads its intent. Polish round: lanes carry the same labels as the
// Cut's timeline, and the coverage line states what is scored, refused and
// silent — computed from the cues, never retyped.

import { useState } from "react";

import { CUES, MUSIC_STYLE_BLOCK, UNSPOTTABLE, sceneClock, type SpottingCue } from "../../_studio/score";
import { PROJECT } from "../../_studio/scenes";
import { CueStatusWord, TimeRuler, spanStyle } from "../../_studio/projectParts";
import { MusicRequestError, audioUrl, generateCueAudio } from "@/lib/musicClient";
import type { MusicProvenance } from "@/lib/music/types";

/** One cue's live take, in this session. Not yet persisted — a generated
 *  take lives as long as the tab; IndexedDB is the next seam.
 *
 *  `provenance` rides on the done state because it is the ONLY thing on this
 *  surface entitled to name a vendor or a model. It comes back from the engine
 *  with the take (lib/music/types.ts MusicProvenance) and says who served,
 *  with which model id, for how many milliseconds, at what time. Before this it
 *  was returned, passed through musicClient, and read by nobody — while the
 *  surface printed a hand-typed `lyria-3` beside a button wired to ElevenLabs. */
export type Take =
  | { state: "working" }
  | { state: "done"; url: string; provenance: MusicProvenance }
  | { state: "refused"; msg: string }
  | { state: "error"; msg: string };

/**
 * WHAT MAY BE CLAIMED ABOUT THE ENGINE for one cue — three states kept
 * deliberately apart rather than collapsed into one blank:
 *
 *   · a take in hand → the take's own `MusicProvenance` speaks, and it is the
 *     only thing on this surface entitled to name a vendor or a model id;
 *   · a cue the project fixture calls rendered, with no take here → the record
 *     is ABSENT and says so, because "we have no provenance" and "it was made
 *     by X" are different sentences;
 *   · a cue never rendered → NOTHING is claimed. Not a default, not a dash
 *     standing in for one. Absence reads as absence.
 *
 * Exported because it is the whole decision this direction is about, and a
 * decision inside JSX is a decision nothing can test.
 */
export function engineCredit(cue: SpottingCue, take: Take | undefined): { text: string; why: string } {
  if (take?.state === "done")
    return {
      text: `${take.provenance.vendor} · ${take.provenance.modelId} · ${Math.round(take.provenance.requestedMs / 1000)}s asked`,
      why: `Read from the take's provenance, returned by the render at ${take.provenance.generatedAt}.`,
    };
  if (cue.status === "rendered")
    return {
      text: "model not recorded",
      why:
        "This cue is marked rendered by the project fixture, but no take from this engine is in hand, " +
        "so no provenance exists to name a vendor or a model. Render it to get one.",
    };
  return { text: "", why: "" };
}

export default function ScoreSpotting() {
  // Open on the refused cue when there is one — and survive a project with no
  // cues at all, which is now a state this surface can genuinely be in: cues
  // are derived from the picture, so a film with no scenes has none.
  const [focus, setFocus] = useState(
    CUES.find((c) => c.status === "failed")?.id ?? CUES[0]?.id ?? "",
  );
  const [takes, setTakes] = useState<Record<string, Take>>({});
  const cue = CUES.find((c) => c.id === focus) ?? CUES[0];
  const take = cue ? takes[cue.id] : undefined;

  async function renderCue() {
    if (!cue) return;
    setTakes((t) => ({ ...t, [cue.id]: { state: "working" } }));
    try {
      const out = await generateCueAudio({
        title: cue.title,
        intent: cue.note,
        bpm: cue.bpm,
        styleBlock: MUSIC_STYLE_BLOCK,
        // THE FILM ITSELF. No `durS`: the seconds of music bought are derived
        // server-side from these scenes, so the length requested cannot drift
        // from the length of picture it plays under.
        picture: cue.picture,
      });
      setTakes((t) => ({
        ...t,
        [cue.id]: { state: "done", url: audioUrl(out), provenance: out.provenance },
      }));
    } catch (e) {
      // A refusal is a spotting outcome, not an error — the region reverts to
      // refused-silence and the surface says so, in its own color.
      const refused = e instanceof MusicRequestError && e.code === "refused";
      const msg = e instanceof Error ? e.message : "The music call failed.";
      setTakes((t) => ({ ...t, [cue.id]: refused ? { state: "refused", msg } : { state: "error", msg } }));
    }
  }

  // The clock is derived ONCE, in the fixture module, and the cue spans are
  // derived from the same walk — the picture lane and the music lane can no
  // longer disagree about where a scene starts.
  const sceneCells = sceneClock();

  const credit = cue ? engineCredit(cue, take) : { text: "", why: "" };

  const scoredS = CUES.filter((c) => c.status === "rendered").reduce((n, c) => n + c.durS, 0);
  const refusedS = CUES.filter((c) => c.status === "failed").reduce((n, c) => n + c.durS, 0);
  const silentS = PROJECT.totalS - scoredS - refusedS;

  return (
    <div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex gap-3">
          <span className="w-14 shrink-0" />
          <div className="flex-1">
            <TimeRuler />
          </div>
        </div>

        {/* picture lane */}
        <div className="mt-3 flex items-center gap-3">
          <span className="font-jetbrains w-14 shrink-0 text-right text-[10px] tracking-[0.12em] text-white/40 uppercase">
            picture
          </span>
          <div className="relative h-9 flex-1">
            {sceneCells.map(({ scene, startS }) => (
              <div
                key={scene.id}
                style={spanStyle(startS, scene.targetS)}
                className="absolute inset-y-0 rounded-md border border-white/10 bg-white/[0.04] px-2"
                title={scene.slug}
              >
                <span className="font-jetbrains text-[10px] leading-9 text-white/50">sc {scene.index}</span>
              </div>
            ))}
          </div>
        </div>

        {/* music lane */}
        <div className="mt-2 flex items-center gap-3">
          <span className="font-jetbrains w-14 shrink-0 text-right text-[10px] tracking-[0.12em] text-white/40 uppercase">
            music
          </span>
          <div className="relative h-11 flex-1">
            {CUES.map((c) => (
              <button
                key={c.id}
                onClick={() => setFocus(c.id)}
                style={spanStyle(c.startS, c.durS)}
                title={c.title}
                className={`absolute inset-y-0 rounded-md border px-2 text-left transition ${
                  c.status === "failed"
                    ? "border-dashed border-rose-400/40 bg-rose-400/[0.04]"
                    : "border-cyan-400/30 bg-cyan-400/[0.08]"
                } ${focus === c.id ? "ring-1 ring-cyan-300/50" : ""}`}
              >
                <span
                  className={`font-jetbrains block truncate text-[10px] leading-[2.6] ${
                    c.status === "failed" ? "text-rose-300/90" : "text-cyan-200/90"
                  }`}
                >
                  {c.title}
                </span>
              </button>
            ))}
          </div>
        </div>

        <p className="font-jetbrains mt-3 text-[11px] text-white/35">
          <span className="text-cyan-300/80">{scoredS}s scored</span>
          {" · "}
          <span className="text-rose-300/80">{refusedS}s refused</span>
          {" · "}
          {silentS}s unspotted — spans to scale on the {PROJECT.totalS}s clock
        </p>
        {/* SPOTS THAT COULD NOT BECOME CUES, said rather than swallowed. A cue's
            span IS the film it covers, so a spot whose scenes this project does
            not have has no span to draw — and is not quietly given a default
            one. On a project with no scenes at all this is every spot, and the
            timeline above is honestly empty. */}
        {UNSPOTTABLE.length > 0 && (
          <p className="font-jetbrains mt-2 text-[11px] leading-snug text-amber-200/70">
            {UNSPOTTABLE.length} spot{UNSPOTTABLE.length > 1 ? "s" : ""} could not be placed:{" "}
            {UNSPOTTABLE.map((u) => `"${u.spot.title}" ${u.why}`).join("; ")}.
          </p>
        )}
      </div>

      {!cue ? (
        /* NO PICTURE, NO CUES. Not an error and not an empty box with a
           disabled button: there is nothing to spot, and the surface says which
           step supplies what is missing. */
        <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <p className="text-sm leading-snug text-slate-400">
            Nothing to spot. Cues are spans of film, and this project has no scenes for them to sit
            on — so there is no cue to brief, no duration to buy and nothing to draw on the clock.
            Spot music after the picture exists.
          </p>
        </div>
      ) : (
      <div
        className={`mt-4 rounded-2xl border p-4 ${
          cue.status === "failed" ? "border-rose-400/25 bg-rose-400/[0.03]" : "border-white/8 bg-white/[0.02]"
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-sm font-medium text-white">{cue.title}</h3>
          <span className="font-jetbrains text-[11px] text-white/40">
            {cue.startS}s → {cue.startS + cue.durS}s · {cue.bpm} bpm
          </span>
          <CueStatusWord status={cue.status} />
          {/* THE ENGINE THAT ANSWERED, OR NOTHING. A model id is a property of
              a take, so it is printed only when a take exists to own it — and
              then it is read off the provenance the engine returned, never off
              the cue. A cue with no take in hand says the record is absent
              rather than falling back to a default, because a default here is
              indistinguishable from a fact and this exact spot printed a
              fictional vendor for months. */}
          {credit.text && (
            <span className="font-jetbrains text-[11px] text-white/30" title={credit.why}>
              {credit.text}
            </span>
          )}
          {cue.status === "failed" && cue.failure && (
            <span
              className="font-jetbrains rounded border border-rose-400/25 px-1.5 py-0.5 text-[10px] text-rose-300/80"
              title="The engine's own outcome vocabulary (MusicErrorKind, lib/music/errors.ts) — a state the adapter really returns, not a description of one."
            >
              kind={cue.failure}
            </span>
          )}
        </div>
        <p className={`mt-1.5 text-sm leading-snug ${cue.status === "failed" ? "text-rose-200/90" : "text-slate-400"}`}>
          {cue.note}
        </p>
        {/* A SPECIFIED BEHAVIOUR THIS BUILD DOES NOT HAVE, said out loud. The
            dashed border and the words carry the whole meaning: the studio
            intends this, the studio does not do it, and nothing on the timeline
            above should be read as if it did. */}
        {cue.declaredNotPerformed && (
          <p className="font-jetbrains mt-2 inline-flex items-center gap-2 rounded border border-dashed border-amber-300/30 px-2 py-1 text-[10px] text-amber-200/70">
            <span className="uppercase tracking-[0.14em] text-amber-300/60">not performed</span>
            {cue.declaredNotPerformed} — declared intent; there is no mixing stage in this build.
          </p>
        )}
        {/* The music engine is real now — /api/music/generate renders a cue's
            brief through lib/music: title, intent, bpm, the project's standing
            style block, AND the scenes this cue plays under. The duration is
            not sent; it is derived from those scenes server-side, so the
            seconds of music bought are the seconds of film covered. */}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={renderCue}
            disabled={take?.state === "working"}
            className="rounded-lg border border-cyan-400/30 bg-cyan-400/[0.08] px-3 py-1.5 text-[11px] font-medium text-cyan-200/90 transition hover:bg-cyan-400/[0.14] disabled:cursor-wait disabled:opacity-50"
          >
            {take?.state === "working"
              ? "rendering…"
              : take?.state === "done"
                ? "render another take"
                : cue.status === "failed"
                  ? "re-ask the model"
                  : "render this cue"}
          </button>
          <span
            className="font-jetbrains text-[10px] text-white/35"
            title={cue.picture.scenes.map((sc) => `sc ${sc.index} ${sc.slug} — ${sc.mood}`).join("\n")}
          >
            {cue.durS}s · {cue.bpm} bpm · briefed from sc{" "}
            {cue.picture.scenes.map((sc) => sc.index).join(", ")} — duration derived from picture
          </span>
        </div>
        {take?.state === "done" && <audio controls src={take.url} className="mt-3 h-9 w-full" />}
        {(take?.state === "refused" || take?.state === "error") && (
          <p className="font-jetbrains mt-3 text-[11px] leading-snug text-rose-200/70">{take.msg}</p>
        )}
        {cue.status === "failed" && take?.state !== "done" && (
          <p className="font-jetbrains mt-3 text-[11px] leading-snug text-rose-200/60">
            {cue.durS}s of the {PROJECT.totalS}s clock plays silent until a take lands. A refusal keeps
            it silent on purpose — refused-silence is a state this cut renders, not an error it hides.
          </p>
        )}
      </div>
      )}
    </div>
  );
}
