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

import { TRIALS } from "./trials";

const DEFAULT_SUBJECT = TRIALS[0].subject;

/** How many approved proofs to send as style references.
 *
 *  The model accepts 14, but each is a ~250KB base64 payload and they go up the
 *  wire on every trial. Four is where the style is unambiguous and the request
 *  is still quick — past that you are paying seconds for agreement you already
 *  had. */
const MAX_REFS = 4;

/** One candidate per trial. Declared once so the price shown before the click
 *  and the count sent to the vendor cannot drift apart. */
const IMAGES_PER_RUN = 1;

/**
 * THE PRICE SEAM — why a literal sits in a client component, and how it leaves.
 *
 * The authoritative table is `lib/imaging/pricing.ts`, and it is SERVER ONLY:
 * everything under `lib/imaging/` reads API keys, so a component importing from
 * there is exactly how a key reaches the browser bundle. Nothing serves a price
 * over the wire and no server parent passes one down, so it is declared here —
 * overridable by prop, which is the shape the fix takes. Removing the literal
 * needs one of two edits nobody in this write set owns: a `GET
 * /api/imaging/pricing` handler, or the price threaded from app/library/page.tsx.
 *
 * The figure is the PRODUCTION vendor's measured rate: $0.045/render on Google
 * at 1K, from the 60-cell trial grid (docs/imaging.md § The provider verdict,
 * restated at lib/imaging/router.ts:46-47). The browser cannot know which
 * environment will answer and the dev vendor is cheaper, so quoting production
 * errs HIGH — the right direction for a warning about money. KEEP IN STEP with
 * pricing.ts.
 */
const ESTIMATED_USD_PER_IMAGE = 0.045;

/**
 * The money line after a render — a comparison rather than a flag, on purpose.
 *
 * `Provenance` carries the figure but not its BASIS: nothing says whether the
 * vendor reported the number or `pricing.ts` derived it. Divergence from our own
 * estimate is the only signal the browser has — a figure that differs can only
 * have come from the vendor, so it shows plain, as a receipt. When the two
 * coincide we keep the cautious "~", because calling a receipt an estimate is
 * the safe error and the reverse puts a guess in front of a user as fact.
 * SEAM: a `costBasis` field on `Provenance` would make this exact.
 */
function costLine(usd: number | undefined, estimate: number): string {
  // Never $0.00 — that is a claim about money nobody can support.
  if (usd === undefined) return "cost not reported";
  return `${Math.abs(usd - estimate) < 0.0005 ? "~" : ""}$${usd.toFixed(4)}`;
}

export default function Playground({
  block,
  references = [],
  onKeep,
  keepLabel = "keep as proof",
  disabled,
  usdPerImage = ESTIMATED_USD_PER_IMAGE,
}: {
  block: StyleBlock;
  /** Approved proofs from this theme, newest first. */
  references?: { base64: string; mime: string }[];
  onKeep?: (r: GenerateResult, subject: string) => void | Promise<void>;
  keepLabel?: string;
  disabled?: boolean;
  /** Estimated USD per image, for the price shown BEFORE the click. */
  usdPerImage?: number;
}) {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [kept, setKept] = useState(false);
  // On by default once proofs exist — style-locked is the intended behaviour.
  // The toggle exists so the difference can be SEEN, which is the only way to
  // know whether locking is doing anything.
  const [useRefs, setUseRefs] = useState(true);
  // What this panel has spent since it mounted. `unpriced` counts the renders
  // the vendor would not price, which is what turns the total into a FLOOR
  // rather than a figure — the same idiom the Frames spend line uses.
  const [spend, setSpend] = useState({ usd: 0, runs: 0, unpriced: 0 });

  const estimate = usdPerImage * IMAGES_PER_RUN;
  const refs = references.slice(0, MAX_REFS);
  const conditioned = useRefs && refs.length > 0;

  const prompt = compilePrompt(block, subject);
  const tooLong = prompt.length > PROMPT_CHAR_LIMIT;

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setKept(false);
    try {
      const res = await generateImage({
        prompt,
        negativePrompt: NEGATIVE_PROMPT,
        aspect: "16:9",
        count: IMAGES_PER_RUN,
        references: conditioned ? refs : undefined,
      });
      setResult(res);
      // The money left the account whether or not the vendor named a figure, so
      // a render that came back unpriced is COUNTED rather than treated as free.
      setSpend((s) => ({
        usd: s.usd + (res.provenance.costUsd ?? 0),
        runs: s.runs + 1,
        unpriced: s.unpriced + (res.provenance.costUsd === undefined ? 1 : 0),
      }));
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
            onClick={() => setSubject(t.subject)}
            title={`${t.problem} · ${t.beat}`}
            className={`font-jetbrains rounded-full border px-2.5 py-1 text-[11px] transition ${
              subject === t.subject
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
        {/* THE PRICE, BEFORE THE CLICK — not a dialog. Every render here spends
            real money and the user used to learn the figure afterwards, in the
            provenance line. A modal on each click would kill the one thing a
            playground is for, so the bar is that the number is simply visible
            next to the button that spends it, with the session total beside it. */}
        <span
          className="font-jetbrains text-[10px] text-white/40"
          title="Estimated from the production vendor's measured rate. The dev vendor is cheaper, so this errs high; the vendor's own figure replaces it after the render."
        >
          est. ${estimate.toFixed(3)} · {IMAGES_PER_RUN} image{IMAGES_PER_RUN > 1 ? "s" : ""}
          {spend.runs > 0 && (
            <span className="text-white/30">
              {" · "}
              {spend.unpriced ? "at least " : "~"}${spend.usd.toFixed(3)} over {spend.runs} render
              {spend.runs > 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span className="font-jetbrains text-[10px] text-white/30">
          {prompt.length}/{PROMPT_CHAR_LIMIT} chars
        </span>

        {references.length > 0 && (
          <label className="font-jetbrains ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-white/55">
            <input
              type="checkbox"
              checked={useRefs}
              onChange={(e) => setUseRefs(e.target.checked)}
              className="accent-cyan-300"
            />
            style-locked on {refs.length} proof{refs.length > 1 ? "s" : ""}
          </label>
        )}
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
              {(result.provenance.durationMs / 1000).toFixed(1)}s ·{" "}
              {/* Whatever came back WINS over the estimate shown before the
                  click — including when it came back as nothing. */}
              {costLine(result.provenance.costUsd, estimate)}
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
