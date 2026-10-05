"use client";

// THE OPERATOR'S BATCH — folded by default, because in triage the generating
// is mostly done by agents (pipeline/sound.mts generate) and the operator's
// job here is judging. Open, it sends N identical briefs to the provider, so
// the takes differ only by the provider's variance — which is exactly what a
// judge then measures. Every take lands unjudged with origin "lab", after the
// agents' in the queue (./model.ts#queueOrder).
//
// It bills: the coin and "Ns of audio · unpriced" sit on the button
// (../shared/price.tsx, from lib/musicClient.ts#costLabel), the seconds are
// length × count, and the provider's own error comes back verbatim. The
// server's music budget guard applies to every call.

import { useState } from "react";

import { ChevronDown, Layers } from "lucide-react";

import { Panel } from "@/components/ui/Primitives";
import { Select } from "@/components/ui/Select";
import { generateTake } from "@/lib/sound/client";
import { TECHNIQUES, type SoundKind, type SoundTake } from "@/lib/sound/types";

import { SpendButton, useMusicPrice } from "../shared/price";
import { useSoundLab } from "../shared/shell";
import { CAPS, FIELD, pill } from "../shared/ui";

import { DURATION, batchProblem, batchPrompt, batchRequests, blankBatch, type BatchForm } from "./model";

const KEYS = [
  "C major", "C minor", "D major", "D minor", "Eb major", "E minor", "F major", "F minor",
  "G major", "G minor", "Ab major", "A minor", "Bb major", "B minor",
];

export default function Batch({ kind, onMade }: { kind: SoundKind; onMade: (ts: SoundTake[]) => void }) {
  const lab = useSoundLab();
  const cost = useMusicPrice();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<BatchForm>(() => blankBatch(kind));
  const [busy, setBusy] = useState<{ done: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<BatchForm>) => setF((x) => ({ ...x, ...p }));
  const problem = batchProblem(kind, f);
  const seconds = f.durationS * f.count;
  const d = DURATION[kind];

  const run = async () => {
    const reqs = batchRequests(kind, f);
    setError(null);
    setBusy({ done: 0, of: reqs.length });
    const made: SoundTake[] = [];
    for (const r of reqs) {
      const res = await generateTake(r);
      if (!res.ok) {
        setError(res.error);
        break;
      }
      made.push(res.data.take);
      onMade([res.data.take]);
      setBusy({ done: made.length, of: reqs.length });
    }
    setBusy(null);
    if (made.length) {
      lab.refresh();
      lab.say(`${made.length} take${made.length === 1 ? "" : "s"} queued`);
    }
  };

  return (
    <Panel className="grid gap-0 p-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-white/[0.03]"
      >
        <Layers className="h-4 w-4 text-cyan-200/70" aria-hidden />
        <span className="font-instrument text-lg text-white/85">Batch</span>
        <span className="truncate font-jetbrains text-label text-white/35">
          {open ? "" : `${f.count} × ${f.durationS}s · ElevenLabs`}
        </span>
        <ChevronDown className={`ml-auto h-4 w-4 text-white/40 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="grid gap-3.5 border-t border-white/6 px-4 pb-4 pt-3.5">
          {kind === "sfx" ? (
            <>
              <div className="grid gap-1.5">
                <span className={CAPS}>event</span>
                <input value={f.event} onChange={(e) => set({ event: e.target.value })} placeholder="heavy door slam" aria-label="Event" className={FIELD} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid min-w-0 gap-1.5">
                  <span className={CAPS}>material</span>
                  <input value={f.material} onChange={(e) => set({ material: e.target.value })} placeholder="oak, iron latch" className={FIELD} />
                </label>
                <label className="grid min-w-0 gap-1.5">
                  <span className={CAPS}>space</span>
                  <input value={f.space} onChange={(e) => set({ space: e.target.value })} placeholder="close, stone hall" className={FIELD} />
                </label>
              </div>
              <label className="grid min-w-0 gap-1.5">
                <span className={CAPS}>more</span>
                <input value={f.prompt} onChange={(e) => set({ prompt: e.target.value })} placeholder="short tail, no reverb wash" className={FIELD} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid min-w-0 gap-1.5">
                  <span className={CAPS}>category</span>
                  <input value={f.sfxCategory} onChange={(e) => set({ sfxCategory: e.target.value })} placeholder="impact" className={FIELD} />
                </label>
                <div className="grid min-w-0 gap-1.5">
                  <span className={CAPS}>loop</span>
                  <button type="button" aria-pressed={f.loop} onClick={() => set({ loop: !f.loop })} className={`${pill(f.loop)} h-[38px] justify-center rounded-lg`}>
                    {f.loop ? "loop" : "one-shot"}
                  </button>
                </div>
              </div>
              <label className="grid min-w-0 gap-1.5">
                <span className={CAPS}>influence</span>
                <span className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 focus-within:border-cyan-400/40">
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={f.promptInfluence ?? ""}
                    placeholder="vendor default"
                    aria-label="Prompt influence, 0 to 1; empty for the vendor default"
                    onChange={(e) => set({ promptInfluence: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full min-w-0 bg-transparent font-jetbrains text-label text-white/90 tabular-nums placeholder:text-white/25"
                  />
                  <span className="shrink-0 whitespace-nowrap font-jetbrains text-label text-white/40">0–1</span>
                </span>
              </label>
            </>
          ) : (
            <>
              <label className="grid min-w-0 gap-1.5">
                <span className={CAPS}>prompt</span>
                <textarea
                  value={f.prompt}
                  onChange={(e) => set({ prompt: e.target.value })}
                  rows={3}
                  placeholder="slow synthwave, warm analog pads, gated snare, 84 BPM"
                  className={`${FIELD} resize-y leading-snug`}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid min-w-0 gap-1.5">
                  <span className={CAPS}>genre</span>
                  <input value={f.genre} onChange={(e) => set({ genre: e.target.value })} placeholder="synthwave" className={FIELD} />
                </label>
                <label className="grid min-w-0 gap-1.5">
                  <span className={CAPS}>mood</span>
                  <input value={f.mood} onChange={(e) => set({ mood: e.target.value })} placeholder="nocturnal" className={FIELD} />
                </label>
                <label className="col-span-2 grid min-w-0 gap-1.5">
                  <span className={CAPS}>instrument</span>
                  <input value={f.instrument} onChange={(e) => set({ instrument: e.target.value })} placeholder="pads, 808" className={FIELD} />
                </label>
              </div>
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 focus-within:border-cyan-400/40">
                  <input
                    type="number"
                    min={40}
                    max={220}
                    value={f.tempoBpm ?? ""}
                    placeholder="—"
                    aria-label="Tempo in BPM"
                    onChange={(e) => set({ tempoBpm: e.target.value ? Number(e.target.value) : null })}
                    className="w-full min-w-0 bg-transparent font-jetbrains text-label text-white/90 tabular-nums placeholder:text-white/25"
                  />
                  <span className="font-jetbrains text-label text-white/40">BPM</span>
                </label>
                <Select<string>
                  label="key"
                  value={f.key ?? ""}
                  placeholder="any"
                  options={[{ value: "", label: "any key" }, ...KEYS.map((k) => ({ value: k, label: k }))]}
                  onChange={(k) => set({ key: k || null })}
                />
              </div>
            </>
          )}

          <div className="grid gap-1.5">
            <span className={CAPS}>technique</span>
            <div className="flex flex-wrap gap-1.5">
              {TECHNIQUES[kind].map((t) => {
                const on = f.technique.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ technique: on ? f.technique.filter((x) => x !== t) : [...f.technique, t] })}
                    className={`${pill(on)} font-jetbrains`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="grid min-w-0 gap-1.5">
            <span className={CAPS}>negative</span>
            <input value={f.negative} onChange={(e) => set({ negative: e.target.value })} placeholder="vocals, crowd noise" className={FIELD} />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 focus-within:border-cyan-400/40">
              <input
                type="number"
                min={d.min}
                max={d.max}
                step={d.step}
                value={f.durationS}
                aria-label="Length in seconds"
                onChange={(e) => set({ durationS: Number(e.target.value) })}
                className="w-full min-w-0 bg-transparent font-jetbrains text-label text-white/90 tabular-nums"
              />
              <span className="font-jetbrains text-label text-white/40">s</span>
            </label>
            <div className="flex h-10 items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-1.5">
              <button
                type="button"
                aria-label="One take fewer"
                disabled={f.count <= 1}
                onClick={() => set({ count: f.count - 1 })}
                className="grid h-7 w-7 cursor-pointer place-items-center rounded-md font-jetbrains text-label text-white/60 hover:bg-white/[0.06] disabled:opacity-30"
              >
                −
              </button>
              <span className="font-jetbrains text-label tabular-nums text-white/85">
                {f.count} <span className="text-white/40">takes</span>
              </span>
              <button
                type="button"
                aria-label="One take more"
                disabled={f.count >= 6}
                onClick={() => set({ count: f.count + 1 })}
                className="grid h-7 w-7 cursor-pointer place-items-center rounded-md font-jetbrains text-label text-white/60 hover:bg-white/[0.06] disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>

          {kind === "sfx" && batchPrompt(kind, f) && (
            <p className="rounded-lg border border-white/6 px-3 py-2 font-hanken text-label leading-snug text-white/60">{batchPrompt(kind, f)}</p>
          )}

          <SpendButton cost={cost(seconds)} onClick={() => void run()} busy={!!busy} disabled={!!problem} wide>
            {busy ? `rendering ${busy.done + 1} of ${busy.of}` : problem ?? `render ${f.count}`}
          </SpendButton>
          {error && <p role="alert" className="font-hanken text-label leading-snug text-rose-200/90">{error}</p>}
        </div>
      )}
    </Panel>
  );
}
