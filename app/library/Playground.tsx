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

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { imgSrc, generateImage, ImagingRequestError, type GenerateResult } from "@/lib/imagingClient";
import { compilePrompt, NEGATIVE_PROMPT, PROMPT_CHAR_LIMIT } from "@/lib/stylePrompt";
import { SEND_REFS, type StyleBlock } from "@/lib/themes";

import { TRIALS } from "./trials";

const DEFAULT_SUBJECT = TRIALS[0].subject;

/** One candidate per trial. Declared once so the price shown before the click
 *  and the count sent to the vendor cannot drift apart. */
const IMAGES_PER_RUN = 1;

/**
 * THE PRICE SEAM, now crossed.
 *
 * This component used to declare `ESTIMATED_USD_PER_IMAGE = 0.045` — a second
 * copy of a number `lib/imaging/pricing.ts` owns — because that table is SERVER
 * ONLY (everything under `lib/imaging/` reads API keys, so a component importing
 * from there is how a key reaches the browser bundle) and nothing served the
 * figure over the wire. `GET /api/imaging/pricing` now does. The route hands
 * back the table's own pre-click estimate; nothing in this file restates it, so
 * the price cannot drift out of step with the one declaration of it.
 *
 * The estimate is the dearest declared per-image rate, which is the honest
 * answer to a question asked before the router has picked a vendor. Read the
 * route handler for what that response does and does not contain — the short
 * version is that it is derived from a module constant and carries no key, no
 * environment and no clue about which vendors this deployment can reach.
 *
 * Any surface with the same need — Frames spends far more here than the
 * playground does — fetches the same route rather than copying this code.
 */
interface PreClickPrice {
  /** Absent when the table declares no per-image rate. NOT zero. */
  usd?: number;
  /** Already written for a person; goes straight into the tooltip. */
  note: string;
}

/** Asked once per page load and shared by every playground on it. The table is
 *  a module constant on the server, so a second fetch could only ever return
 *  the same bytes. */
let pricePromise: Promise<PreClickPrice> | null = null;

function perImagePrice(): Promise<PreClickPrice> {
  pricePromise ??= (async () => {
    const res = await fetch("/api/imaging/pricing");
    if (!res.ok) throw new Error(`pricing answered ${res.status}`);
    const doc = (await res.json()) as { perImage?: { usd?: unknown; note?: unknown } };
    const q = doc.perImage;
    if (!q || typeof q.note !== "string") throw new Error("pricing returned a body we cannot read");
    // A non-number `usd` becomes ABSENT, never 0 — the whole point of the
    // unpriced basis is that a missing figure must not print as free.
    return { usd: typeof q.usd === "number" ? q.usd : undefined, note: q.note };
  })().catch((e: unknown) => {
    // One blip must not poison the rest of the session: drop the memo so the
    // next mount asks again.
    pricePromise = null;
    throw e;
  });
  return pricePromise;
}

/**
 * The money line after a render.
 *
 * This used to infer its own answer: `Provenance` carried the figure but not its
 * basis, so the browser guessed from DIVERGENCE — a number unlike our estimate
 * could only have come from the vendor — and stayed cautious whenever the two
 * happened to coincide. That was the safe error in the right direction, and it
 * was still a guess. `Provenance.costBasis` now says outright, so the label is
 * read rather than deduced.
 *
 * `basis` may be absent on a call made before the field existed. Falling back to
 * the tilde is deliberate: an unknown basis is not a receipt, and the one thing
 * this line must never do is put our own arithmetic in front of a user as fact.
 */
function costLine(usd: number | undefined, basis: string | undefined): string {
  // Never $0.00 — that is a claim about money nobody can support.
  if (usd === undefined) return "cost not reported";
  return `${basis === "vendor-reported" ? "" : "~"}$${usd.toFixed(4)}`;
}

/**
 * The money line BEFORE the click, in all four of its states.
 *
 * Three of them are ways of not knowing, and they are kept apart rather than
 * collapsed into one blank: still asking, asked and the route did not answer,
 * and the table declaring no rate for a per-image render. None of them may
 * render as $0.000 — an unknown price is unknown, and a zero is a claim.
 */
function priceLabel(price: PreClickPrice | "unknown" | null): { text: string; title: string } {
  if (price === null)
    return { text: "checking the price…", title: "Asking /api/imaging/pricing what a render costs." };
  if (price === "unknown")
    return {
      text: "price unknown",
      title:
        "The price table could not be reached, so this render's cost is not known in advance. " +
        "Whatever it actually costs is reported under the image afterwards.",
    };
  if (price.usd === undefined) return { text: "price not declared", title: price.note };
  return {
    text: `est. $${(price.usd * IMAGES_PER_RUN).toFixed(3)} · ${IMAGES_PER_RUN} image${IMAGES_PER_RUN > 1 ? "s" : ""}`,
    title: price.note,
  };
}

export default function Playground({
  block,
  references = [],
  onKeep,
  keepLabel = "keep as proof",
  disabled,
  usdPerImage,
}: {
  block: StyleBlock;
  /** Approved proofs from this theme, newest first. */
  references?: { base64: string; mime: string }[];
  onKeep?: (r: GenerateResult, subject: string) => void | Promise<void>;
  keepLabel?: string;
  disabled?: boolean;
  /** Estimated USD per image, for the price shown BEFORE the click. Left unset
   *  the panel asks /api/imaging/pricing itself; a server parent that already
   *  holds the figure can pass it and save the round trip. */
  usdPerImage?: number;
}) {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [kept, setKept] = useState(false);
  /** In flight. Separate from `kept`, which means "the write finished": the gap
   *  between the click and that is exactly the double-submit window. */
  const [keeping, setKeeping] = useState(false);
  // On by default once proofs exist — style-locked is the intended behaviour.
  // The toggle exists so the difference can be SEEN, which is the only way to
  // know whether locking is doing anything.
  const [useRefs, setUseRefs] = useState(true);
  // What this panel has spent since it mounted. `unpriced` counts the renders
  // the vendor would not price, which is what turns the total into a FLOOR
  // rather than a figure — the same idiom the Frames spend line uses.
  const [spend, setSpend] = useState({ usd: 0, runs: 0, unpriced: 0 });
  /** `null` while the answer is still in flight, `"unknown"` when it never
   *  arrived. Three distinguishable states, because "we are asking", "we asked
   *  and nobody knows" and "$0.045" are three different things to tell someone
   *  standing in front of a button that spends money. */
  const [price, setPrice] = useState<PreClickPrice | "unknown" | null>(
    usdPerImage === undefined
      ? null
      : { usd: usdPerImage, note: "Supplied by the surface this playground sits in." },
  );

  useEffect(() => {
    if (usdPerImage !== undefined) return;
    let live = true;
    void perImagePrice().then(
      (p) => live && setPrice(p),
      // Deliberately not an error banner: failing to fetch a price is not a
      // failed render, and the panel still works. It just stops claiming to
      // know what a click costs.
      () => live && setPrice("unknown"),
    );
    return () => {
      live = false;
    };
  }, [usdPerImage]);

  const estimate = priceLabel(price);
  const refs = references.slice(0, SEND_REFS);
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
        <p className="font-jetbrains mr-1 text-content tracking-[0.14em] text-white/40 uppercase">try it on</p>
        {TRIALS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubject(t.subject)}
            title={`${t.problem} · ${t.beat}`}
            className={`font-jetbrains rounded-full border px-2.5 py-1 text-label transition ${
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
        className="font-hanken w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-content leading-snug text-white placeholder:text-white/30 focus:border-cyan-400/40"
        placeholder="What should this style draw?"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={run}
          disabled={busy || disabled || tooLong || !subject.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-300/90 px-4 py-2 text-label font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
          {busy ? "rendering…" : "render a trial"}
        </button>
        {/* THE PRICE, BEFORE THE CLICK — not a dialog. Every render here spends
            real money and the user used to learn the figure afterwards, in the
            provenance line. A modal on each click would kill the one thing a
            playground is for, so the bar is that the number is simply visible
            next to the button that spends it, with the session total beside it.
            The figure comes from /api/imaging/pricing, so it is the same
            declaration the server bills against rather than a copy of it. */}
        <span
          className={`font-jetbrains text-label ${price === "unknown" ? "text-amber-300/70" : "text-white/40"}`}
          title={estimate.title}
        >
          {estimate.text}
          {spend.runs > 0 && (
            <span className="text-white/30">
              {" · "}
              {spend.unpriced ? "at least " : "~"}${spend.usd.toFixed(3)} over {spend.runs} render
              {spend.runs > 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span className="font-jetbrains text-label text-white/30">
          {prompt.length}/{PROMPT_CHAR_LIMIT} chars
        </span>

        {references.length > 0 && (
          <label className="font-jetbrains ml-auto flex cursor-pointer items-center gap-1.5 text-label text-white/55">
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
        <p className="text-content leading-snug text-amber-200/90">
          This block compiles to {prompt.length} characters and Leonardo accepts {PROMPT_CHAR_LIMIT}. Shorten
          the technique or finish line.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-content leading-snug text-rose-200">
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
            <p className="font-jetbrains text-content text-white/35">
              {result.provenance.provider} · {result.provenance.model} ·{" "}
              {(result.provenance.durationMs / 1000).toFixed(1)}s ·{" "}
              {/* Whatever came back WINS over the estimate shown before the
                  click — including when it came back as nothing. */}
              {costLine(result.provenance.costUsd, result.provenance.costBasis)}
              {/* The studio-cleanliness receipt, shown rather than hidden: if a
                  remote generation survived, the user should know. */}
              {result.provenance.cleanup === "failed" && (
                <span className="text-amber-300/90"> · not cleaned up remotely</span>
              )}
            </p>
            {onKeep && (
              <button
                onClick={async () => {
                  // GUARD FIRST, THEN AWAIT. `setKept(true)` used to run after
                  // the await, so the whole IndexedDB write was a window in
                  // which `disabled={kept}` was still false — a second click
                  // inside it called onKeep again, and because a proof's id is
                  // minted from Date.now()+Math.random() the second write was a
                  // NEW row rather than an overwrite: two identical proofs on
                  // the sheet, each carrying its own copy of a megabyte-scale
                  // base64 plate.
                  //
                  // This repo has measured this exact failure once already, in
                  // useAssets.ts: "with random ids produced sixty assets instead
                  // of thirty". There it was fixed by content-addressing the id
                  // so a repeat write is an overwrite. A proof id cannot follow
                  // without changing the scheme of rows already in the store, so
                  // the guard is the fix here and the id stays as it is.
                  if (kept || keeping) return;
                  setKeeping(true);
                  try {
                    await onKeep(result, subject);
                    setKept(true);
                  } finally {
                    setKeeping(false);
                  }
                }}
                disabled={kept || keeping}
                className="font-jetbrains rounded-lg border border-white/12 px-3 py-1.5 text-label text-white/75 transition hover:bg-white/5 disabled:opacity-40"
              >
                {kept ? "kept" : keeping ? "keeping…" : keepLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
