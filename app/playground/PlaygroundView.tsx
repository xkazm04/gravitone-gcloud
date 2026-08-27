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

import { useCallback, useState } from "react";

import StudioFrame from "@/components/ui/StudioFrame";
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

const card = "rounded-2xl border border-white/8 bg-white/[0.02] p-5";
const label = "font-jetbrains block text-[10px] tracking-[0.14em] text-white/40 uppercase";
const field =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 placeholder:text-white/25 focus:border-cyan-400/40 focus:outline-none";
const btn =
  "rounded-lg border border-cyan-400/30 bg-cyan-400/[0.08] px-4 py-2 text-[12px] font-medium text-cyan-200/90 transition hover:bg-cyan-400/[0.14] disabled:cursor-wait disabled:opacity-50";
const chip =
  "rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] text-white/60 transition hover:border-cyan-400/40 hover:text-cyan-200";

function BusyLine({ busy }: { busy: Busy }) {
  if (busy.state === "working")
    return <p className="font-jetbrains mt-3 animate-pulse text-[11px] text-cyan-200/70">{busy.label}</p>;
  if (busy.state === "error")
    return <p className="font-jetbrains mt-3 text-[11px] leading-snug text-rose-200/70">{busy.msg}</p>;
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
    <section className={`${card} opacity-60`}>
      <h2 className="font-instrument text-lg text-white/70">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{reason}</p>
    </section>
  );
}

export default function PlaygroundView() {
  // Read once per mount. These are build-time constants in the bundle, so this
  // cannot change under the component and does not need to be state.
  const caps = capabilities();
  const [renders, setRenders] = useState<Render[]>([]);
  const [nextId, setNextId] = useState(1);

  const addRender = useCallback(
    (from: string, result: DetailedMusicResult) => {
      const r: Render = { id: nextId, from, url: blobUrl(result.audio), result };
      setNextId((n) => n + 1);
      setRenders((rs) => [r, ...rs]);
      return r;
    },
    [nextId],
  );

  return (
    <StudioFrame>
      <div className="pb-16">
        <header className="mb-6">
          <h1 className="font-instrument text-3xl text-white">Music playground</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            A temporary bench for the vendor&apos;s latest music features — free plan drafting, exact-duration
            renders, section editing against stored audio, and text-to-SFX. Everything here spends real credits
            except drafting a plan, which is free and is therefore where iteration belongs.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* QuickTake and PlanLab both render through /api/music/compose, so
              they stand or fall with the section-edit capability rather than
              with musicGenerate — which governs the Score phase's cue render,
              a different route with a different portability story. */}
          {caps.musicSectionEdit ? (
            <QuickTake addRender={addRender} />
          ) : (
            <Unavailable title="Quick take" reason={ABSENCE_REASON.musicSectionEdit} />
          )}
          {caps.musicSfx ? <SfxBench /> : <Unavailable title="SFX bench" reason={ABSENCE_REASON.musicSfx} />}
        </div>
        <div className="mt-5">
          {caps.musicSectionEdit ? (
            <PlanLab addRender={addRender} />
          ) : (
            <Unavailable title="Plan lab" reason={ABSENCE_REASON.musicSectionEdit} />
          )}
        </div>
        <div className="mt-5">
          {caps.musicSectionEdit ? (
            <SectionEdit renders={renders} addRender={addRender} />
          ) : (
            <Unavailable title="Section edit" reason={ABSENCE_REASON.musicSectionEdit} />
          )}
        </div>
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
      <h2 className="text-sm font-medium text-white">1 · Quick take — the naive baseline</h2>
      <p className="mt-1 text-[12px] leading-snug text-slate-400">
        One prose prompt, one take. Useful exactly once per idea: to feel how far no structure gets you before
        the plan lab shows what structure buys.
      </p>
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
        <button onClick={run} disabled={busy.state === "working"} className={`${btn} mt-4`}>
          render
        </button>
      </div>
      <BusyLine busy={busy} />
      {url && <audio controls src={url} className="mt-3 h-9 w-full" />}
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
      <h2 className="text-sm font-medium text-white">2 · Plan lab — structure for free, spend on the render</h2>
      <p className="mt-1 text-[12px] leading-snug text-slate-400">
        Drafting a composition plan costs no credits, so this is the iteration surface: shape sections, durations
        and styles until the plan reads right, then pay for exactly one render of it. Edit anything below before
        rendering — the plan is the brief.
      </p>
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
      <div className="mt-3 flex gap-3">
        <button onClick={draft} disabled={busy.state === "working"} className={btn}>
          draft plan · free
        </button>
        {plan && (
          <button onClick={render} disabled={busy.state === "working"} className={btn}>
            render this plan · {totalS.toFixed(0)}s
          </button>
        )}
      </div>
      <BusyLine busy={busy} />

      {plan && (
        <div className="mt-4 space-y-3">
          {plan.chunks.map((c, i) =>
            isGenChunk(c) ? (
              <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-jetbrains text-[10px] tracking-[0.14em] text-cyan-200/70 uppercase">
                    section {i + 1}
                  </span>
                  <span className="font-jetbrains text-[10px] text-white/35">{(c.duration_ms / 1000).toFixed(1)}s</span>
                </div>
                <textarea value={c.text} onChange={(e) => patch(i, { text: e.target.value })} rows={3} className={`${field} mt-2 font-mono text-[12px]`} />
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
      {url && <audio controls src={url} className="mt-4 h-9 w-full" />}
    </section>
  );
}

// ── 3 · section edit ────────────────────────────────────────────────────────

type EditMode = "keep" | "free" | "low" | "medium" | "high";

function SectionEdit({
  renders,
  addRender,
}: {
  renders: Render[];
  addRender: (from: string, r: DetailedMusicResult) => Render;
}) {
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [modes, setModes] = useState<EditMode[]>([]);
  const [texts, setTexts] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>({ state: "idle" });
  const [url, setUrl] = useState<string | null>(null);

  const editable = renders.filter((r) => r.result.songId && r.result.plan);
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

  return (
    <section className={card}>
      <h2 className="text-sm font-medium text-white">3 · Section edit — keep the rest, byte for byte</h2>
      <p className="mt-1 text-[12px] leading-snug text-slate-400">
        Pick any render made on this bench, choose per section: <em>keep</em> holds it by reference to the stored
        original (never re-rendered); a regenerate mode redoes it — <em>free</em>, or conditioned on the original
        at low/medium/high strength. Then A/B the seam by ear against the source. This is the feature the whole
        bench exists to judge.
      </p>

      {editable.length === 0 ? (
        <p className="font-jetbrains mt-3 text-[11px] text-white/35">
          nothing editable yet — render something in the quick take or the plan lab first
        </p>
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
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div>
              <span className={label}>source</span>
              <audio controls src={source.url} className="mt-1 h-9 w-full" />
            </div>
            {url && (
              <div>
                <span className={label}>edit</span>
                <audio controls src={url} className="mt-1 h-9 w-full" />
              </div>
            )}
          </div>

          <div className="mt-3 space-y-3">
            {srcChunks.map((c, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-jetbrains text-[10px] tracking-[0.14em] text-cyan-200/70 uppercase">
                    section {i + 1} · {(c.duration_ms / 1000).toFixed(1)}s
                  </span>
                  <select
                    value={modes[i]}
                    onChange={(e) => setModes((m) => m.map((v, j) => (j === i ? (e.target.value as EditMode) : v)))}
                    className={`${field} w-56`}
                  >
                    <option value="keep">keep — reference the original</option>
                    <option value="high">regenerate · condition high</option>
                    <option value="medium">regenerate · condition medium</option>
                    <option value="low">regenerate · condition low</option>
                    <option value="free">regenerate · free</option>
                  </select>
                </div>
                {modes[i] !== "keep" && (
                  <textarea
                    value={texts[i]}
                    onChange={(e) => setTexts((t) => t.map((v, j) => (j === i ? e.target.value : v)))}
                    rows={3}
                    className={`${field} mt-2 font-mono text-[12px]`}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button onClick={render} disabled={busy.state === "working" || touched === 0} className={btn}>
              render the edit · {touched}/{srcChunks.length} sections touched
            </button>
            {touched === 0 && (
              <span className="font-jetbrains text-[10px] text-white/35">an edit that touches nothing is a copy</span>
            )}
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

function SfxBench() {
  const [text, setText] = useState(SFX_PRESETS[0].text);
  const [seconds, setSeconds] = useState(SFX_PRESETS[0].seconds);
  const [influence, setInfluence] = useState(0.7);
  const [loop, setLoop] = useState(false);
  const [busy, setBusy] = useState<Busy>({ state: "idle" });
  const [url, setUrl] = useState<string | null>(null);

  async function run() {
    setBusy({ state: "working", label: "rendering sfx…" });
    try {
      const out = await generateSfx({ text, durationSeconds: seconds, promptInfluence: influence, loop });
      setUrl(blobUrl(out.audio));
      setBusy({ state: "idle" });
    } catch (e) {
      setBusy({ state: "error", msg: errMsg(e) });
    }
  }

  return (
    <section className={card}>
      <h2 className="text-sm font-medium text-white">4 · SFX bench — the trailer grammar, envelope-first</h2>
      <p className="mt-1 text-[12px] leading-snug text-slate-400">
        Presets carry the punctuation vocabulary — hit, riser, whoosh, drone, boom — each described by its
        envelope, not its mood. The influence dial is the spec-vs-fishing trade: high converges on the
        description, low explores around it.
      </p>
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
        <label className="font-jetbrains flex items-center gap-2 text-[11px] text-white/60">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="accent-cyan-400" />
          seamless loop
        </label>
        <button onClick={run} disabled={busy.state === "working"} className={btn}>
          render sfx
        </button>
      </div>
      <BusyLine busy={busy} />
      {url && <audio controls src={url} loop={loop} className="mt-3 h-9 w-full" />}
      {url && loop && (
        <p className="font-jetbrains mt-2 text-[10px] text-white/35">
          player set to loop — listen across the joint at least twice; a seam inaudible once is a metronome by the tenth pass
        </p>
      )}
    </section>
  );
}
