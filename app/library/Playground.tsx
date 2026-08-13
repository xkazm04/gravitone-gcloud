"use client";

// THE PLAYGROUND — does this style actually hold?
//
// A style block is words until something renders it, and the failure mode this
// panel exists to catch is the one the research batch kept naming: a look that
// reads fine on the frame you designed it against and falls apart on the next
// subject. So the subject is an INPUT here, pre-loaded with a canonical test
// and freely editable — the useful act is generating twice with the same block
// and a different subject, then seeing whether the two look like one
// publication.
//
// Whatever survives that becomes a PROOF, which is how the sheet gets built and
// how the theme eventually locks. The playground is not a toy bolted to the
// side; it is the only route to a locked style.

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { imgSrc, generateImage, ImagingRequestError, type GenerateResult } from "@/lib/imagingClient";
import { compilePrompt, NEGATIVE_PROMPT, PROMPT_CHAR_LIMIT } from "@/lib/stylePrompt";
import type { StyleBlock } from "@/lib/themes";

const TRIALS = [
  { id: "bars", label: "chart", text: "Three ascending bars on a ground line, with one arrow arcing over them." },
  { id: "map", label: "map", text: "A simple coastline with three ports marked along it, and a route line between two of them." },
  { id: "gears", label: "mechanism", text: "Two interlocking gears, the larger one turning the smaller, on a plain ground." },
  { id: "people", label: "figures", text: "Three simple human figures standing in a row, one of them clearly apart from the other two." },
];

export default function Playground({
  block,
  onKeep,
  keepLabel = "keep as proof",
  disabled,
}: {
  block: StyleBlock;
  onKeep?: (r: GenerateResult, subject: string) => void | Promise<void>;
  keepLabel?: string;
  disabled?: boolean;
}) {
  const [subject, setSubject] = useState(TRIALS[0].text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [kept, setKept] = useState(false);

  const prompt = compilePrompt(block, subject);
  const tooLong = prompt.length > PROMPT_CHAR_LIMIT;

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setKept(false);
    try {
      setResult(await generateImage({ prompt, negativePrompt: NEGATIVE_PROMPT, aspect: "16:9", count: 1 }));
    } catch (e) {
      setError(
        e instanceof ImagingRequestError
          ? // A refusal is not a retry — say so, because the fix is the prompt.
            e.code === "refused"
            ? `${e.message} Try a different subject — repeating this one will refuse again.`
            : e.message
          : "The generation failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="font-jetbrains mr-1 text-[11px] tracking-[0.14em] text-white/40 uppercase">try it on</p>
        {TRIALS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubject(t.text)}
            className={`font-jetbrains rounded-full border px-2.5 py-1 text-[11px] transition ${
              subject === t.text
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                : "border-white/10 text-white/50 hover:text-white/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <textarea
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        rows={3}
        className="font-hanken w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[13px] leading-snug text-white placeholder:text-white/30 focus:border-cyan-400/40 focus:outline-none"
        placeholder="What should this style draw?"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={run}
          disabled={busy || disabled || tooLong || !subject.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-300/90 px-4 py-2 text-[13px] font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
          {busy ? "rendering…" : "render a trial"}
        </button>
        <span className="font-jetbrains text-[10px] text-white/30">
          {prompt.length}/{PROMPT_CHAR_LIMIT} chars
        </span>
      </div>

      {tooLong && (
        <p className="text-[12px] leading-snug text-amber-200/90">
          This block compiles to {prompt.length} characters and Leonardo accepts {PROMPT_CHAR_LIMIT}. Shorten
          the technique or finish line.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-[12px] leading-snug text-rose-200">
          {error}
        </p>
      )}

      {busy && (
        <div className="aspect-video animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" aria-hidden />
      )}

      {result && result.images[0] && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL from
              a just-generated buffer; next/image optimises remote or bundled files. */}
          <img
            src={imgSrc(result.images[0])}
            alt={`A trial render: ${subject}`}
            className="w-full rounded-xl border border-white/10"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-jetbrains text-[10px] text-white/35">
              {result.provenance.provider} · {result.provenance.model} ·{" "}
              {(result.provenance.durationMs / 1000).toFixed(1)}s
              {result.provenance.costUsd !== undefined && ` · $${result.provenance.costUsd.toFixed(4)}`}
              {/* The studio-cleanliness receipt, shown rather than hidden: if a
                  remote generation survived, the user should know. */}
              {result.provenance.cleanup === "failed" && (
                <span className="text-amber-300/90"> · not cleaned up remotely</span>
              )}
            </p>
            {onKeep && (
              <button
                onClick={async () => {
                  await onKeep(result, subject);
                  setKept(true);
                }}
                disabled={kept}
                className="font-jetbrains rounded-lg border border-white/12 px-3 py-1.5 text-[11px] text-white/75 transition hover:bg-white/5 disabled:opacity-40"
              >
                {kept ? "kept" : keepLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
