"use client";

// MUSIC PLAYGROUND — temporary by design (see the MODULES comment).
//
// A bench for the music vendor's latest feature surface, arranged in the
// order a trailer pipeline would actually use it:
//
//   1. QUICK TAKE     one prompt, one render — the naive baseline to beat.
//   2. PLAN LAB       draft a composition plan for FREE, edit its sections
//                     (durations, styles, lyrics), then spend on the render.
//   3. SECTION EDIT   the reason this bench exists: pick any render made
//                     here, keep sections by reference (byte-identical),
//                     regenerate others — optionally under the original's
//                     influence — and A/B the seam by ear.
//   4. SFX BENCH      envelope-first effects with the trailer grammar as
//                     presets; duration, adherence dial, seamless loop.
//
// Everything renders through the gated /api/music/* seams; no vendor
// knowledge lives in this file beyond the wire plan types.
//
// ── WHY THE LAYOUT CHANGED ──────────────────────────────────────────────────
//
// The four notes above used to be printed on the page as well: four cards,
// each with a numbered title and a teaching paragraph under it. Four equal
// cards each explaining themselves is a numbered ESSAY, and the numbering was
// carrying sequencing work that nothing visual carried — the dependency (① and
// ② feed ③) existed only in a sentence inside ③ saying so.
//
// The ordinality and the readiness moved into a GUTTER RAIL down the left, one
// node per bench: filled = it has produced something, a lit ring = it can be
// used now, hollow = it is waiting on one above it. Then every paragraph had
// nothing left to say, and each was replaced by the affordance it was
// describing — the credit facts onto the buttons that spend them, the seam
// lesson onto a waveform with ticks at the joints, the keep/condition grammar
// onto a segmented ramp. This comment block is where those notes belong.

import { useCallback, useEffect, useRef, useState } from "react";

import { Coins, Dices, Link2, Lock, Repeat } from "lucide-react";

import StudioFrame from "@/components/ui/StudioFrame";
import { Waveform } from "@/components/ui/Primitives";
import { Ghost, PipRow, Tally } from "@/components/ui/signal";
import { ABSENCE_REASON, capabilities } from "@/lib/capabilities";
import {
  MusicRequestError,
  blobUrl,
  composeRaw,
  draftPlan,
  generateSfx,
} from "@/lib/musicClient";
import type {
  DetailedMusicResult,
  WireChunk,
  WireGenerationChunk,
  WirePlan,
} from "@/lib/music/types";

// ── tiny shared bits ────────────────────────────────────────────────────────

type Busy = { state: "idle" } | { state: "working"; label: string } | { state: "error"; msg: string };

function errMsg(e: unknown): string {
  if (e instanceof MusicRequestError) return `${e.code}: ${e.message}`;
  return e instanceof Error ? e.message : "failed";
}

function isGenChunk(c: WireChunk): c is WireGenerationChunk {
  return (c as WireGenerationChunk).text !== undefined;
}

function chunkMs(c: WireChunk): number {
  return isGenChunk(c) ? c.duration_ms : c.range.end_ms - c.range.start_ms;
}

/** Where the joints fall, as fractions of the whole — the interior boundaries
 *  only, since the ends of a piece are not seams. This is the number a listener
 *  is being asked to judge, so it is drawn rather than described. */
function seams(chunks: WireChunk[]): number[] {
  const total = chunks.reduce((n, c) => n + chunkMs(c), 0);
  if (total <= 0) return [];
  const out: number[] = [];
  let at = 0;
  for (const c of chunks.slice(0, -1)) {
    at += chunkMs(c);
    out.push(at / total);
  }
  return out;
}

const card = "rounded-2xl border border-white/8 bg-white/[0.02] p-5";
const label = "font-jetbrains block text-label tracking-[0.14em] text-white/40 uppercase";
// THE LAST `focus:outline-none` IN THE REPO, and it made a documented invariant
// false. app/globals.css states, as fact, that "all ten are gone" and that the
// class "no longer appears anywhere in app/ or components/". It appeared here —
// one input class string on a bench surface, carrying only a `focus:` border
// tint, which is exactly the seven-of-ten case that sweep was written to end.
// Found 2026-09-08 by an executor that had been handed the claim as law.
//
// The border tint stays; it just no longer replaces the ring. Dropping the
// opt-out lets the base rule in globals.css apply, which is the whole point of
// declaring it there once.
const field =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-label text-slate-200 placeholder:text-white/25 focus:border-cyan-400/40";
const btn =
  "rounded-lg border border-cyan-400/30 bg-cyan-400/[0.08] px-4 py-2 text-label font-medium text-cyan-200/90 transition hover:bg-cyan-400/[0.14] disabled:cursor-wait disabled:opacity-50";
const chip =
  "rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-label text-white/60 transition hover:border-cyan-400/40 hover:text-cyan-200";

/** A bench's place in the sequence, drawn in the gutter rather than written
 *  into its title. `produced` is the strongest claim on the page: this panel
 *  has actually made audio in this session. */
type Stage = "produced" | "ready" | "waiting" | "off";

const STAGE_DOT: Record<Stage, string> = {
  produced: "border-cyan-300/70 bg-cyan-300/80",
  ready: "border-cyan-300/70",
  waiting: "border-white/20",
  off: "border-white/10",
};

const STAGE_SAID: Record<Stage, string> = {
  produced: "has produced audio",
  ready: "ready",
  waiting: "waiting on an earlier bench",
  off: "unavailable here",
};

/**
 * One rung of the bench: the gutter node, the connector down to the next one,
 * and the panel beside it.
 *
 * The ordinal is the node's POSITION, never a numeral typed into a heading —
 * which is what "1 · Quick take", "2 · Plan lab" were, and what made reordering
 * the page a copy edit.
 */
function Bench({
  n,
  of,
  stage,
  children,
}: {
  n: number;
  of: number;
  stage: Stage;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4">
      <span
        role="img"
        aria-label={`Bench ${n} of ${of}: ${STAGE_SAID[stage]}`}
        className="flex flex-col items-center pt-6"
      >
        <span
          aria-hidden
          className={`h-3 w-3 shrink-0 rounded-full border ${STAGE_DOT[stage]} ${
            stage === "ready" ? "animate-pulse" : ""
          }`}
        />
        {n < of && <span aria-hidden className="mt-1.5 w-px flex-1 bg-white/10" />}
      </span>
      {children}
    </li>
  );
}

/**
 * A strip of audio with its JOINTS MARKED.
 *
 * Two sentences on this page taught the same lesson in words — "listen across
 * the joint at least twice; a seam inaudible once is a metronome by the tenth
 * pass", and "then A/B the seam by ear against the source". A seam is a place
 * in a piece of audio, so it is drawn as one: a cyan hairline where two
 * sections meet, or at both ends when the player is looping and the joint is
 * the wrap itself.
 */
/** Bars in a seam strip. Fixed rather than responsive because EqBars draws a
 *  fixed-width bar; this is the number that makes the strip about 430px. */
const BARS = 72;

function SeamStrip({ at, label }: { at: number[]; label: string }) {
  return (
    // A <div>, not a <span>: <Waveform> renders a flex <div>, and flow content
    // inside phrasing content is invalid however it is styled.
    //
    // `w-fit` on the inner box is load-bearing. EqBars draws fixed 3px bars, so
    // the waveform's real width is BARS * 6px and not the container's — ticks
    // positioned as a percentage of a full-width box would sit beside the
    // picture they are marking rather than on it.
    <div
      role="img"
      aria-label={label}
      className="mt-2 inline-block max-w-full overflow-hidden rounded-lg border border-white/8 bg-white/[0.02] px-2 py-1.5"
    >
      <div className="relative h-7 w-fit">
        <Waveform bars={BARS} className="h-full" />
        {at.map((f, i) => (
          <span
            key={i}
            aria-hidden
            style={{ left: `calc(${f * 100}% - 0.5px)` }}
            className="absolute inset-y-0 w-px bg-cyan-300"
          />
        ))}
      </div>
    </div>
  );
}

/** THE CREDIT FACT, ON THE BUTTON THAT SPENDS. The header used to carry it as
 *  prose — "everything here spends real credits except drafting a plan" — a
 *  paragraph away from every control it was about. */
function Spends() {
  return <Coins className="h-3.5 w-3.5 shrink-0 opacity-70" aria-label="spends credits" />;
}

function BusyLine({ busy }: { busy: Busy }) {
  if (busy.state === "working")
    return <p className="font-jetbrains mt-3 animate-pulse text-content text-cyan-200/70">{busy.label}</p>;
  if (busy.state === "error")
    return <p className="font-jetbrains mt-3 text-content leading-snug text-rose-200/70">{busy.msg}</p>;
  return null;
}

/** A render this bench produced, listed as edit-source material. */
interface Render {
  id: number;
  from: string;
  url: string;
  result: DetailedMusicResult;
}

// ── the page ────────────────────────────────────────────────────────────────

/** A panel this deployment cannot serve, drawn as absent-and-explained rather
 *  than hidden.
 *
 *  HIDDEN WOULD BE WORSE, and the choice is deliberate. The playground's whole
 *  job is to exercise the vendor's feature surface, so a reader who knows the
 *  bench has four panels and finds three needs to know whether the fourth was
 *  removed, broke, or is unavailable here. Silence answers none of those. The
 *  panel keeps its place and its title, loses its controls, and says why — which
 *  is the same rule the imaging chokepoint follows when a vendor drops out of a
 *  chain: no elimination is silent. */
function Unavailable({ title, reason }: { title: string; reason: string }) {
  return (
    <section className={card}>
      <h2 className="font-instrument flex items-center gap-2 text-lg text-white/70">
        <Lock className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
        {title}
      </h2>
      {/* ABSENCE_REASON is verbatim: it names which vendor capability is
          missing and what to do about it, which is the work, not narration. */}
      <p className="mt-2 text-content text-slate-400">{reason}</p>
      {/* The SHAPE of what is missing, so a reader who knows the bench has four
          panels can see this one still has controls somewhere else. */}
      <Ghost shape="row" count={2} label={`${title} controls are unavailable here`} className="mt-4" />
    </section>
  );
}

export default function PlaygroundView() {
  // Read once per mount. These are build-time constants in the bundle, so this
  // cannot change under the component and does not need to be state.
  const caps = capabilities();
  const [renders, setRenders] = useState<Render[]>([]);
  /** The SFX bench allocates and owns its own url rather than filing one in
   *  `renders`, so its rung cannot be derived from that list — it says so. */
  const [sfxDone, setSfxDone] = useState(false);
  /**
   * The id counter is a REF, not state, and that is the fix rather than a
   * preference.
   *
   * It used to be `useState`, and `addRender` read `nextId` from the render
   * closure while incrementing through `setNextId((n) => n + 1)`. The updater
   * was correct and the line above it was not: two renders that resolve in the
   * same batch — which is the normal case here, since every section of this
   * bench can be firing at once — both read the same `nextId` and were filed
   * under the SAME ID. `renders` is keyed by id, so the second one replaced the
   * first in the list while its blob URL stayed allocated, and the section
   * editor offered one source where two had been paid for.
   *
   * A ref increments once per call whatever React batches, and it takes
   * `addRender` down to stable identity as a side effect, which is what its
   * `useCallback` was for in the first place.
   */
  const nextId = useRef(1);

  /**
   * THE BLOB URLS THIS PAGE OWNS, RELEASED WHEN IT GOES.
   *
   * `blobUrl`'s own docstring says "Caller revokes when done" and no caller in
   * this repository ever did — `URL.revokeObjectURL` appeared nowhere in it.
   * Every render on this bench allocates a multi-megabyte object URL the browser
   * holds until the document is discarded, and this is the one surface built to
   * produce many of them in a sitting.
   *
   * Ownership decides who revokes, so it is worth stating: this page owns every
   * url `addRender` mints. `QuickTake` DISPLAYS one it got back and must not
   * revoke it; `SfxBench` allocates its own and revokes its own.
   *
   * Written from inside `addRender` — an event handler — rather than by syncing
   * a ref to `renders` during render, which is what react-hooks/refs objects to
   * and objects to correctly.
   */
  const owned = useRef<string[]>([]);

  const addRender = useCallback((from: string, result: DetailedMusicResult) => {
    const url = blobUrl(result.audio);
    owned.current.push(url);
    const r: Render = { id: nextId.current++, from, url, result };
    setRenders((rs) => [r, ...rs]);
    return r;
  }, []);

  useEffect(
    () => () => {
      for (const url of owned.current) URL.revokeObjectURL(url);
      owned.current = [];
    },
    [],
  );

  /** Which benches have produced audio in this session, read off the one list
   *  that records it. `from` is the bench's own name at the call site. */
  const made = (from: string) => renders.some((r) => r.from.startsWith(from));
  /** A render can be edited only if the vendor gave back a stored song and the
   *  plan that produced it. Lifted here because the RAIL needs the same answer
   *  the section editor does, and two copies of it would drift. */
  const editable = renders.filter((r) => r.result.songId && r.result.plan);

  return (
    <StudioFrame>
      <div className="pb-16">
        <header className="mb-6">
          <h1 className="font-instrument text-3xl text-white">Music playground</h1>
        </header>

        {/* ONE COLUMN, ONE RAIL. The two-column grid put the SFX bench beside
            the quick take and the section editor two rows below the renders it
            eats, so the reading order and the dependency order disagreed. In a
            single column the rail can be continuous, and it is the rail that
            says which bench is waiting on which. */}
        <ol className="space-y-5">
          {/* QuickTake and PlanLab both render through /api/music/compose, so
              they stand or fall with the section-edit capability rather than
              with musicGenerate — which governs the Score phase's cue render,
              a different route with a different portability story. */}
          <Bench
            n={1}
            of={4}
            stage={!caps.musicSectionEdit ? "off" : made("quick take") ? "produced" : "ready"}
          >
            {caps.musicSectionEdit ? (
              <QuickTake addRender={addRender} />
            ) : (
              <Unavailable title="Quick take" reason={ABSENCE_REASON.musicSectionEdit} />
            )}
          </Bench>
          <Bench
            n={2}
            of={4}
            stage={!caps.musicSectionEdit ? "off" : made("plan lab") ? "produced" : "ready"}
          >
            {caps.musicSectionEdit ? (
              <PlanLab addRender={addRender} />
            ) : (
              <Unavailable title="Plan lab" reason={ABSENCE_REASON.musicSectionEdit} />
            )}
          </Bench>
          <Bench
            n={3}
            of={4}
            // The dependency, drawn: ③ stays hollow until ① or ② has produced
            // something it can edit. That is what the sentence "nothing
            // editable yet — render something in the quick take or the plan lab
            // first" was for, said by the gutter instead.
            stage={
              !caps.musicSectionEdit
                ? "off"
                : made("edit of")
                  ? "produced"
                  : editable.length > 0
                    ? "ready"
                    : "waiting"
            }
          >
            {caps.musicSectionEdit ? (
              <SectionEdit editable={editable} addRender={addRender} />
            ) : (
              <Unavailable title="Section edit" reason={ABSENCE_REASON.musicSectionEdit} />
            )}
          </Bench>
          <Bench n={4} of={4} stage={!caps.musicSfx ? "off" : sfxDone ? "produced" : "ready"}>
            {caps.musicSfx ? (
              <SfxBench onProduced={() => setSfxDone(true)} />
            ) : (
              <Unavailable title="SFX bench" reason={ABSENCE_REASON.musicSfx} />
            )}
          </Bench>
        </ol>
      </div>
    </StudioFrame>
  );
}

// ── 1 · quick take ──────────────────────────────────────────────────────────

function QuickTake({ addRender }: { addRender: (from: string, r: DetailedMusicResult) => Render }) {
  const [prompt, setPrompt] = useState("Dark cinematic trailer cue, low strings and taiko, slow build to a hard hit, instrumental");
  const [lengthS, setLengthS] = useState(20);
  const [busy, setBusy] = useState<Busy>({ state: "idle" });
  const [url, setUrl] = useState<string | null>(null);

  async function run() {
    setBusy({ state: "working", label: "rendering from prompt…" });
    try {
      const out = await composeRaw({ prompt, lengthMs: Math.round(lengthS * 1000) });
      setUrl(addRender("quick take", out).url);
      setBusy({ state: "idle" });
    } catch (e) {
      setBusy({ state: "error", msg: errMsg(e) });
    }
  }

  return (
    <section className={card}>
      <h2 className="font-instrument text-lg text-white">Quick take</h2>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} className={`${field} mt-3`} />
      <div className="mt-3 flex items-center gap-3">
        <div>
          <span className={label}>length s</span>
          <input
            type="number"
            min={3}
            max={600}
            value={lengthS}
            onChange={(e) => setLengthS(Number(e.target.value))}
            className={`${field} w-24`}
          />
        </div>
        <button
          onClick={run}
          disabled={busy.state === "working"}
          className={`${btn} mt-4 inline-flex items-center gap-2`}
        >
          <Spends />
          render
        </button>
      </div>
      <BusyLine busy={busy} />
      {url && (
        <>
          <audio controls src={url} className="mt-3 h-9 w-full" />
          {/* One unbroken take: no joints, so no ticks. Drawn all the same, so
              the plan lab's and the editor's strips read as the same object
              with something added rather than as a different widget. */}
          <SeamStrip at={[]} label={`One unbroken take, ${lengthS} seconds`} />
        </>
      )}
    </section>
  );
}

// ── 2 · plan lab ────────────────────────────────────────────────────────────

function PlanLab({ addRender }: { addRender: (from: string, r: DetailedMusicResult) => Render }) {
  const [prompt, setPrompt] = useState(
    "A 40 second game trailer cue: ominous build over low strings and pulsing synth, breaks to near-silence, then a massive percussive finale that ends hard on the beat",
  );
  const [lengthS, setLengthS] = useState(40);
  const [style, setStyle] = useState("dark orchestral, modern trailer production, instrumental");
  const [negativeStyle, setNegativeStyle] = useState("vocals, fade-out ending");
  const [plan, setPlan] = useState<WirePlan | null>(null);
  const [busy, setBusy] = useState<Busy>({ state: "idle" });
  const [url, setUrl] = useState<string | null>(null);

  async function draft() {
    setBusy({ state: "working", label: "drafting plan (free)…" });
    try {
      const out = await draftPlan({ prompt, lengthMs: Math.round(lengthS * 1000), style, negativeStyle });
      setPlan(out.plan);
      setUrl(null);
      setBusy({ state: "idle" });
    } catch (e) {
      setBusy({ state: "error", msg: errMsg(e) });
    }
  }

  async function render() {
    if (!plan) return;
    setBusy({ state: "working", label: "rendering the plan…" });
    try {
      const out = await composeRaw({ plan });
      setUrl(addRender("plan lab", out).url);
      setBusy({ state: "idle" });
    } catch (e) {
      setBusy({ state: "error", msg: errMsg(e) });
    }
  }

  function patch(i: number, p: Partial<WireGenerationChunk>) {
    setPlan((cur) => {
      if (!cur) return cur;
      const chunks = cur.chunks.slice();
      chunks[i] = { ...(chunks[i] as WireGenerationChunk), ...p };
      return { chunks };
    });
  }

  const totalS = plan ? plan.chunks.reduce((n, c) => n + chunkMs(c), 0) / 1000 : 0;

  return (
    <section className={card}>
      <h2 className="font-instrument text-lg text-white">Plan lab</h2>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className={`${field} mt-3`} />
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <span className={label}>length s</span>
          <input type="number" min={3} max={300} value={lengthS} onChange={(e) => setLengthS(Number(e.target.value))} className={field} />
        </div>
        <div>
          <span className={label}>global style</span>
          <input value={style} onChange={(e) => setStyle(e.target.value)} className={field} />
        </div>
        <div>
          <span className={label}>exclude</span>
          <input value={negativeStyle} onChange={(e) => setNegativeStyle(e.target.value)} className={field} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        {/* THE ONLY FREE CONTROL ON THE PAGE, and the page used to say so in a
            header paragraph two panels away. It says it itself; every button
            that spends carries a coin instead. */}
        <button onClick={draft} disabled={busy.state === "working"} className={btn}>
          draft plan
          <span className="ml-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-label text-emerald-200/90">
            free
          </span>
        </button>
        {plan && (
          <button
            onClick={render}
            disabled={busy.state === "working"}
            className={`${btn} inline-flex items-center gap-2`}
          >
            <Spends />
            render this plan · {totalS.toFixed(0)}s
          </button>
        )}
      </div>
      <BusyLine busy={busy} />

      {plan && (
        <div className="mt-4 space-y-3">
          {/* THE PLAN AS A TIMELINE. Each section's width is its duration, so
              "this is 40 seconds and the finale is a third of it" is readable
              before a credit is spent — which is what a plan lab is for. */}
          <div
            role="img"
            aria-label={`Plan timeline: ${plan.chunks.filter(isGenChunk).length} sections, ${totalS.toFixed(0)} seconds`}
            className="flex gap-1"
          >
            {plan.chunks.filter(isGenChunk).map((c, i) => (
              <span
                key={i}
                style={{ flexGrow: c.duration_ms, flexBasis: 0 }}
                className="font-jetbrains flex h-8 min-w-0 items-center justify-center overflow-hidden rounded border border-cyan-400/20 bg-cyan-400/[0.06] text-label text-cyan-200/70"
              >
                {(c.duration_ms / 1000).toFixed(0)}s
              </span>
            ))}
          </div>
          {plan.chunks.map((c, i) =>
            isGenChunk(c) ? (
              <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-jetbrains text-label tracking-[0.14em] text-cyan-200/70 uppercase">
                    section {i + 1}
                  </span>
                  <span className="font-jetbrains text-label text-white/35">{(c.duration_ms / 1000).toFixed(1)}s</span>
                </div>
                <textarea value={c.text} onChange={(e) => patch(i, { text: e.target.value })} rows={3} className={`${field} mt-2 font-mono text-label`} />
                <div className="mt-2 grid gap-2 md:grid-cols-4">
                  <div>
                    <span className={label}>duration s</span>
                    <input
                      type="number"
                      min={3}
                      max={120}
                      step={0.5}
                      value={c.duration_ms / 1000}
                      onChange={(e) => patch(i, { duration_ms: Math.round(Number(e.target.value) * 1000) })}
                      className={field}
                    />
                  </div>
                  <div>
                    <span className={label}>include</span>
                    <input
                      value={c.positive_styles.join(", ")}
                      onChange={(e) => patch(i, { positive_styles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      className={field}
                    />
                  </div>
                  <div>
                    <span className={label}>exclude</span>
                    <input
                      value={c.negative_styles.join(", ")}
                      onChange={(e) => patch(i, { negative_styles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      className={field}
                    />
                  </div>
                  <div>
                    <span className={label}>adherence</span>
                    <select
                      value={c.context_adherence ?? "high"}
                      onChange={(e) => patch(i, { context_adherence: e.target.value as WireGenerationChunk["context_adherence"] })}
                      className={field}
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
      {url && plan && (
        <>
          <audio controls src={url} className="mt-4 h-9 w-full" />
          <SeamStrip
            at={seams(plan.chunks)}
            label={`Rendered plan, ${totalS.toFixed(0)} seconds, with ${Math.max(0, plan.chunks.filter(isGenChunk).length - 1)} joints`}
          />
        </>
      )}
    </section>
  );
}

// ── 3 · section edit ────────────────────────────────────────────────────────

type EditMode = "keep" | "free" | "low" | "medium" | "high";

/**
 * THE KEEP/CONDITION GRAMMAR AS A RAMP, not five sentences in a `<select>`.
 *
 * The options used to read "keep — reference the original", "regenerate ·
 * condition high", "regenerate · condition medium"… — the same two words
 * repeated four times with an adjective changing, inside a control that shows
 * one of them at a time so the ramp was invisible. Laid out as a segmented
 * control the shape is the meaning: a link, then one, two, three pips of
 * increasing hold on the original, then the dice.
 *
 * `spoken` is the non-visual channel and is deliberately the fuller sentence —
 * a glyph a screen reader cannot name is the regression this vocabulary exists
 * to avoid.
 */
const EDIT_RAMP: { id: EditMode; pips: number; spoken: string }[] = [
  { id: "keep", pips: 0, spoken: "keep — reference the original, never re-rendered" },
  { id: "low", pips: 1, spoken: "regenerate, conditioned lightly on the original" },
  { id: "medium", pips: 2, spoken: "regenerate, conditioned moderately on the original" },
  { id: "high", pips: 3, spoken: "regenerate, conditioned closely on the original" },
  { id: "free", pips: 0, spoken: "regenerate freely, ignoring the original" },
];

function ModeRamp({
  value,
  onChange,
  label,
}: {
  value: EditMode;
  onChange: (m: EditMode) => void;
  label: string;
}) {
  return (
    <span role="radiogroup" aria-label={label} className="inline-flex items-center gap-1">
      {EDIT_RAMP.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.spoken}
            title={o.spoken}
            onClick={() => onChange(o.id)}
            className={`flex h-8 min-w-9 cursor-pointer items-center justify-center gap-0.5 rounded-lg border px-2 transition ${
              on
                ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/70"
            }`}
          >
            {o.id === "keep" ? (
              <Link2 className="h-4 w-4" aria-hidden />
            ) : o.id === "free" ? (
              <Dices className="h-4 w-4" aria-hidden />
            ) : (
              Array.from({ length: o.pips }, (_, i) => (
                <span key={i} aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
              ))
            )}
          </button>
        );
      })}
    </span>
  );
}

function SectionEdit({
  editable,
  addRender,
}: {
  /** The renders that CAN be edited, decided one level up because the gutter
   *  rail asks the same question to draw this bench's readiness. */
  editable: Render[];
  addRender: (from: string, r: DetailedMusicResult) => Render;
}) {
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [modes, setModes] = useState<EditMode[]>([]);
  const [texts, setTexts] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>({ state: "idle" });
  const [url, setUrl] = useState<string | null>(null);

  const source = editable.find((r) => r.id === sourceId) ?? null;
  const srcChunks = source?.result.plan?.chunks.filter(isGenChunk) ?? [];

  function pick(r: Render) {
    setSourceId(r.id);
    const gen = r.result.plan?.chunks.filter(isGenChunk) ?? [];
    setModes(gen.map(() => "keep"));
    setTexts(gen.map((c) => c.text));
    setUrl(null);
  }

  async function render() {
    if (!source?.result.songId || !source.result.plan) return;
    const songId = source.result.songId;
    // Build the edit plan: kept sections become audio references at their
    // measured ranges; regenerated ones become generation chunks, optionally
    // conditioned on the original at the chosen strength.
    let cursor = 0;
    const chunks: WireChunk[] = [];
    srcChunks.forEach((c, i) => {
      const start = cursor;
      const end = cursor + c.duration_ms;
      cursor = end;
      const mode = modes[i];
      if (mode === "keep") {
        chunks.push({ song_id: songId, range: { start_ms: start, end_ms: end } });
      } else {
        chunks.push({
          ...c,
          text: texts[i],
          ...(mode === "free"
            ? {}
            : { conditioning_ref: { song_id: songId, range: { start_ms: start, end_ms: end } }, condition_strength: mode }),
        });
      }
    });
    setBusy({ state: "working", label: "rendering the edit…" });
    try {
      const out = await composeRaw({ plan: { chunks } });
      setUrl(addRender(`edit of #${source.id}`, out).url);
      setBusy({ state: "idle" });
    } catch (e) {
      setBusy({ state: "error", msg: errMsg(e) });
    }
  }

  const touched = modes.filter((m) => m !== "keep").length;
  /** Where the joints are, once, for both strips: the source and its edit are
   *  the same plan by construction, so a second computation could only differ
   *  by being wrong. */
  const seamAt = seams(srcChunks);

  return (
    <section className={card}>
      <h2 className="font-instrument text-lg text-white">Section edit</h2>

      {editable.length === 0 ? (
        // The chip row, empty — the shape of what the benches above produce.
        // The sentence that used to name them ("render something in the quick
        // take or the plan lab first") is the gutter rail's job: ③ is hollow
        // while nothing feeds it.
        <Ghost
          shape="row"
          count={1}
          label="Nothing editable yet — the benches above have produced no source"
          className="mt-3"
        />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {editable.map((r) => (
            <button
              key={r.id}
              onClick={() => pick(r)}
              className={`${chip} ${sourceId === r.id ? "border-cyan-400/50 text-cyan-200" : ""}`}
            >
              #{r.id} · {r.from} · {((r.result.plan?.chunks.reduce((n, c) => n + chunkMs(c), 0) ?? 0) / 1000).toFixed(0)}s
            </button>
          ))}
        </div>
      )}

      {source && (
        <>
          {/* SOURCE ABOVE EDIT, each over its own seam strip with a tick at
              every joint. Stacked, the A/B is a comparison of two pictures of
              the same shape — which is what "then A/B the seam by ear against
              the source" was asking for in words. */}
          <div className="mt-3 space-y-3">
            <div>
              <span className={label}>source</span>
              <audio controls src={source.url} className="mt-1 h-9 w-full" />
              <SeamStrip
                at={seamAt}
                label={`Source, ${srcChunks.length} sections, ${seamAt.length} joints`}
              />
            </div>
            {url && (
              <div>
                <span className={label}>edit</span>
                <audio controls src={url} className="mt-1 h-9 w-full" />
                <SeamStrip
                  at={seamAt}
                  label={`Edit, ${srcChunks.length} sections, ${seamAt.length} joints`}
                />
              </div>
            )}
          </div>

          <div className="mt-3 space-y-3">
            {srcChunks.map((c, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-jetbrains text-label tracking-[0.14em] text-cyan-200/70 uppercase">
                    section {i + 1} · {(c.duration_ms / 1000).toFixed(1)}s
                  </span>
                  <ModeRamp
                    value={modes[i]}
                    label={`Section ${i + 1} mode`}
                    onChange={(m) => setModes((ms) => ms.map((v, j) => (j === i ? m : v)))}
                  />
                </div>
                {modes[i] !== "keep" && (
                  <textarea
                    value={texts[i]}
                    onChange={(e) => setTexts((t) => t.map((v, j) => (j === i ? e.target.value : v)))}
                    rows={3}
                    className={`${field} mt-2 font-mono text-label`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* "an edit that touches nothing is a copy" is gone. The button is
              already disabled at zero; the pips say which sections move and
              which are held, and a row of hollow pips beside a 0/4 is the
              sentence, drawn. */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={render}
              disabled={busy.state === "working" || touched === 0}
              className={`${btn} inline-flex items-center gap-2`}
            >
              <Spends />
              render the edit
            </button>
            <PipRow
              states={modes.map((m) => (m === "keep" ? ("hollow" as const) : ("filled" as const)))}
              label={`${touched} of ${srcChunks.length} sections regenerated`}
            />
            <Tally
              value={touched}
              of={srcChunks.length}
              label="touched"
              tone={touched === 0 ? "neutral" : "cyan"}
            />
          </div>
          <BusyLine busy={busy} />
        </>
      )}
    </section>
  );
}

// ── 4 · sfx bench ───────────────────────────────────────────────────────────

const SFX_PRESETS: { label: string; text: string; seconds: number; loop: boolean }[] = [
  { label: "hit", text: "Massive cinematic impact hit, sharp metallic attack, sub-heavy body, short controlled tail, dry", seconds: 2, loop: false },
  { label: "riser", text: "Tense orchestral riser, swelling from silence to a sharp cutoff, rising pitch and density throughout", seconds: 6, loop: false },
  { label: "whoosh", text: "Fast air whoosh transition, soft attack, strong stereo motion left to right, clean tail", seconds: 1.5, loop: false },
  { label: "drone", text: "Low ominous drone, dark evolving texture, no melody, no rhythm, steady featureless body", seconds: 20, loop: true },
  { label: "boom", text: "Deep sub bass drop boom, slow decay, felt more than heard, no transient click", seconds: 4, loop: false },
];

function SfxBench({ onProduced }: { onProduced: () => void }) {
  const [text, setText] = useState(SFX_PRESETS[0].text);
  const [seconds, setSeconds] = useState(SFX_PRESETS[0].seconds);
  const [influence, setInfluence] = useState(0.7);
  const [loop, setLoop] = useState(false);
  const [busy, setBusy] = useState<Busy>({ state: "idle" });
  const [url, setUrl] = useState<string | null>(null);

  // This bench ALLOCATES its own url rather than taking one from the render
  // list, so it owns it and has to release it. Every re-render used to drop the
  // previous one on the floor: `setUrl(blobUrl(...))` overwrote the only
  // reference to a multi-megabyte blob the browser then held until the document
  // went away. Revoked when it is replaced, and on unmount.
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  async function run() {
    setBusy({ state: "working", label: "rendering sfx…" });
    try {
      const out = await generateSfx({ text, durationSeconds: seconds, promptInfluence: influence, loop });
      setUrl(blobUrl(out.audio));
      setBusy({ state: "idle" });
      onProduced();
    } catch (e) {
      setBusy({ state: "error", msg: errMsg(e) });
    }
  }

  return (
    <section className={card}>
      {/* The paragraph that stood here listed the five preset chips sitting
          directly below it, and then explained what a slider labelled
          "influence" does. Both are on the screen already. */}
      <h2 className="font-instrument text-lg text-white">SFX bench</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {SFX_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setText(p.text);
              setSeconds(p.seconds);
              setLoop(p.loop);
            }}
            className={chip}
          >
            {p.label}
          </button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className={`${field} mt-3`} />
      <div className="mt-3 grid items-end gap-3 md:grid-cols-4">
        <div>
          <span className={label}>duration s</span>
          <input type="number" min={0.5} max={30} step={0.5} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className={field} />
        </div>
        <div>
          <span className={label}>influence {influence.toFixed(2)}</span>
          <input type="range" min={0} max={1} step={0.05} value={influence} onChange={(e) => setInfluence(Number(e.target.value))} className="mt-3 w-full accent-cyan-400" />
        </div>
        <label className="font-jetbrains flex items-center gap-2 text-label text-white/60">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="accent-cyan-400" />
          seamless loop
        </label>
        <button
          onClick={run}
          disabled={busy.state === "working"}
          className={`${btn} inline-flex items-center justify-center gap-2`}
        >
          <Spends />
          render sfx
        </button>
      </div>
      <BusyLine busy={busy} />
      {url && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <audio controls src={url} loop={loop} className="h-9 min-w-0 flex-1" />
            {/* THE LOOP, LIT. "player set to loop — listen across the joint at
                least twice; a seam inaudible once is a metronome by the tenth
                pass" said three things: that the player loops, where the joint
                is, and to listen twice. The glyph says the first, the strip's
                end ticks say the second, and the third is what a listener does
                with a looping player without being told. */}
            <Repeat
              className={`h-5 w-5 shrink-0 ${loop ? "text-cyan-300" : "text-white/20"}`}
              aria-label={loop ? "Player is looping" : "Player is not looping"}
            />
          </div>
          {/* A loop's joint is the wrap itself, so the seam sits at both ends. */}
          <SeamStrip
            at={loop ? [0, 1] : []}
            label={
              loop
                ? `${seconds} second loop; the joint is at the wrap`
                : `${seconds} seconds, one-shot`
            }
          />
        </>
      )}
    </section>
  );
}
