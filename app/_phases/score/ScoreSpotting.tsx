"use client";

// SCORE / SPOTTING SESSION — the winner. Music against picture: scenes run
// along the clock, cues are spans drawn under them to scale, and clicking a
// span reads its intent. Polish round: lanes carry the same labels as the
// Cut's timeline, and the coverage line states what is scored, refused and
// silent — computed from the cues, never retyped.

import { useEffect, useRef, useState } from "react";

import { CUES, MUSIC_STYLE_BLOCK } from "../../_studio/score";
import { PROJECT, SCENES } from "../../_studio/scenes";
import { CueStatusWord, TimeRuler, spanStyle } from "../../_studio/projectParts";
import { MusicRequestError, audioUrl, generateCueAudio } from "@/lib/musicClient";

/** One cue's live take, in this session. Not persisted, and that is a decision
 *  rather than a gap: what this holds is an object URL over decoded audio, and a
 *  stored `blob:` URL is dead on the next load. Persisting a take means writing
 *  the BYTES — several megabytes a cue — into the same IndexedDB whose step store
 *  names quota exhaustion as a real destination. That call is not made here; see
 *  the ADR in .vault/Architect/decisions/2026-08-29-score-take-persistence.md. */
type Take =
  | { state: "working" }
  | { state: "done"; url: string }
  | { state: "refused"; msg: string }
  | { state: "error"; msg: string };

export default function ScoreSpotting() {
  const [focus, setFocus] = useState(CUES[1].id); // open on the refused cue
  const [takes, setTakes] = useState<Record<string, Take>>({});
  const cue = CUES.find((c) => c.id === focus)!;
  const take = takes[cue.id];

  /** THE URLS THIS SURFACE OWNS, RELEASED WHEN IT GOES, keyed by the cue whose
   *  take they carry.
   *
   *  `blobUrl`'s docstring says "Caller revokes when done", and `f964607` made
   *  the playground bench the first caller in this repository that did. It did
   *  not reach here — the production step calling the same helper — so every
   *  rendered cue left a multi-megabyte decoded blob alive for the life of the
   *  tab, and re-rendering a cue dropped the previous url on the floor with no
   *  reference left to release it.
   *
   *  Keyed rather than a list so a REPLACE releases the take it replaces; the
   *  unmount sweep then has one url per cue to clear, not one per click.
   *  Written only from the event handler and the cleanup, never synced during
   *  render — react-hooks/refs objects to that, and objects correctly. */
  const owned = useRef<Record<string, string>>({});
  /** Whether this surface is still mounted, for the await below. A take that
   *  lands after the step is gone must not mint a url nobody can revoke, and
   *  must not setState on a component that no longer exists. */
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const url of Object.values(owned.current)) URL.revokeObjectURL(url);
      owned.current = {};
    };
  }, []);

  async function renderCue() {
    setTakes((t) => ({ ...t, [cue.id]: { state: "working" } }));
    try {
      const out = await generateCueAudio({
        title: cue.title,
        intent: cue.note,
        bpm: cue.bpm,
        durS: cue.durS,
        styleBlock: MUSIC_STYLE_BLOCK,
      });
      // Minting AFTER the mounted check, not before it: a url created for a
      // surface that has gone has no owner left to release it.
      if (!mounted.current) return;
      const url = audioUrl(out);
      const replaced = owned.current[cue.id];
      if (replaced) URL.revokeObjectURL(replaced);
      owned.current[cue.id] = url;
      setTakes((t) => ({ ...t, [cue.id]: { state: "done", url } }));
    } catch (e) {
      if (!mounted.current) return;
      // A refusal is a spotting outcome, not an error — the region reverts to
      // refused-silence and the surface says so, in its own color.
      const refused = e instanceof MusicRequestError && e.code === "refused";
      const msg = e instanceof Error ? e.message : "The music call failed.";
      setTakes((t) => ({ ...t, [cue.id]: refused ? { state: "refused", msg } : { state: "error", msg } }));
    }
  }

  let cursor = 0;
  const sceneCells = SCENES.map((s) => {
    const startS = cursor;
    cursor += s.targetS;
    return { s, startS };
  });

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
            {sceneCells.map(({ s, startS }) => (
              <div
                key={s.id}
                style={spanStyle(startS, s.targetS)}
                className="absolute inset-y-0 rounded-md border border-white/10 bg-white/[0.04] px-2"
                title={s.slug}
              >
                <span className="font-jetbrains text-[10px] leading-9 text-white/50">sc {s.index}</span>
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
      </div>

      <div
        className={`mt-4 rounded-2xl border p-4 ${
          cue.status === "failed" ? "border-rose-400/25 bg-rose-400/[0.03]" : "border-white/8 bg-white/[0.02]"
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-sm font-medium text-white">{cue.title}</h3>
          <span className="font-jetbrains text-[11px] text-white/40">
            {cue.startS}s → {cue.startS + cue.durS}s · {cue.bpm} bpm · {cue.model}
          </span>
          <CueStatusWord status={cue.status} />
        </div>
        <p className={`mt-1.5 text-sm leading-snug ${cue.status === "failed" ? "text-rose-200/90" : "text-slate-400"}`}>
          {cue.note}
        </p>
        {/* The music engine is real now — /api/music/generate renders a cue's
            brief (title, intent, bpm, exact duration, the project's standing
            style block) through lib/music. The button that once sat here dead
            is back because it can finally do what it says. */}
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
          <span className="font-jetbrains text-[10px] text-white/35">
            {cue.durS}s · {cue.bpm} bpm · plan-briefed, exact duration
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
    </div>
  );
}
