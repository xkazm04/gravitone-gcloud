// PRICING — the one place in the app where the cost of a music call lives.
//
// Built in lib/imaging/pricing.ts's shape, and for the same reason: music is
// the only engine in this product that spends on a single click from a product
// surface, and it was the only one with no price, no ceiling and no log.
// `app/api/music/generate/route.ts` said so out loud rather than hiding it —
// "NOT yet under lib/imaging/budget.ts's spend ceiling: that ledger prices
// per-image USD and a music credit is a different unit". This file answers that
// sentence instead of repeating it.
//
// ── THE UNIT PROBLEM, ANSWERED EXPLICITLY ──────────────────────────────────
//
// Imaging prices a call in USD because Google and Leonardo are billed per
// image and this repo has measured both. ElevenLabs bills music against a
// CREDIT balance, and a credit is not a dollar. Pretending otherwise would put
// a dollar sign in front of a number nobody has ever checked.
//
// So the cost of a music call is modelled as a CHAIN OF THREE UNITS, and each
// link is declared separately, present or absent:
//
//   SECONDS OF AUDIO REQUESTED   ← EXACT. It is the sum of the picture the cue
//                                  covers (lib/music/plan.ts cueDurationS), the
//                                  request carries it, and provenance records
//                                  it as `requestedMs`. Nobody has to measure
//                                  anything for this number to be true.
//   × CREDITS PER SECOND         ← NOT DECLARED. See the rows below.
//   × USD PER CREDIT             ← NOT DECLARED. See the rows below.
//
// A quote therefore reports the link it reached and stops. Today every music
// render quotes as `unpriced` WITH ITS SECONDS ATTACHED, which is strictly more
// than the surface knew before (nothing) and strictly less than a dollar figure
// nobody earned. The moment somebody renders one cue and reads the credit
// delta off their ElevenLabs dashboard, one edit to a row below turns seconds
// into credits everywhere, and one more turns credits into dollars.
//
// THE RULE THIS FILE IS BUILT AROUND, inherited verbatim from imaging: NEVER
// INVENT A PRICE. Every row either carries a figure WITH the source it came
// from and the date that source was last checked, or carries no figure and the
// reason there is none. `undefined` here is a decision, not an omission — read
// the `source` line. A prior wave shipped five deliberately-unpriced imaging
// rows; this file ships three, and says exactly what would fill them.
//
// SERVER ONLY, like the rest of lib/music — not because this file holds a
// secret (it holds none) but because the directory is the seam that keeps the
// ElevenLabs key out of the browser bundle. The browser's route in is
// `GET /api/music/pricing`, and that route's audit rests on one property of
// this module: **it reads no `process.env` and imports nothing that does.** Its
// only import is type-only and therefore erased. Keep it that way.

/** What the vendor counts when it bills an operation. */
export type MusicBillingUnit =
  /** Charged against the ElevenLabs credit balance. */
  | "credits"
  /** Charged nothing. A DECLARED zero, not an unmeasured one. */
  | "none";

/** The operations this engine can perform, as the log and the ledger name
 *  them. One model can bill differently per endpoint, so the row is keyed on
 *  the operation as well as the model. */
export type MusicOp = "generate" | "compose" | "sfx" | "plan";

interface MusicPriceRow {
  vendor: "elevenlabs";
  op: MusicOp;
  /** Exact model id as it goes on the wire, and as it lands in provenance. */
  model: string;
  bills: MusicBillingUnit;
  /** Credits the vendor charges per SECOND of audio produced. Absent =
   *  deliberately unmeasured; `source` says why and what would fill it. */
  creditsPerSecond?: number;
  /** USD the operator pays per credit, on their plan. Absent = not checked. */
  usdPerCredit?: number;
  source: string;
  checked: string;
}

/**
 * THE TABLE. One declared-free row, three deliberately unpriced ones.
 *
 * Note what the unpriced rows are NOT: they are not "we forgot". Each names the
 * exact measurement that would fill it, in one sentence, so filling it is a
 * ten-minute job for whoever next holds a live key — which is the difference
 * between an honest gap and a permanent one.
 */
export const MUSIC_PRICES: readonly MusicPriceRow[] = [
  {
    vendor: "elevenlabs",
    op: "plan",
    model: "music_v2",
    bills: "none",
    // A DECLARED ZERO. Different in kind from the unpriced rows below: this is
    // a fact with a source, not a number nobody looked up.
    creditsPerSecond: 0,
    usdPerCredit: 0,
    source:
      "The composition-plan endpoint costs no credits — vendor docs resolved 2026-08-26 and recorded at lib/music/elevenlabs.ts's draftPlan (\"COSTS NO CREDITS, which makes it the iteration surface\"). It is rate-limited, not metered, which is why the playground drafts structure here and spends on renders.",
    checked: "2026-08-26",
  },
  {
    vendor: "elevenlabs",
    op: "generate",
    model: "music_v2",
    bills: "credits",
    // UNPRICED ON PURPOSE.
    source:
      "Never measured here. ElevenLabs bills music against a CREDIT balance and this repo has never rendered a cue against a live key with the balance read before and after, so no credits-per-second figure exists. WHAT WOULD FILL THIS ROW: render one cue of known length, read the credit delta on the ElevenLabs usage page, divide by the seconds, and record both numbers with today's date. Do not copy a figure from a blog post — the repo's own bill is the only source it has ever trusted for imaging either.",
    checked: "2026-08-29",
  },
  {
    vendor: "elevenlabs",
    op: "compose",
    model: "music_v2",
    bills: "credits",
    // UNPRICED ON PURPOSE.
    source:
      "Same endpoint family as `generate` and presumed to bill the same way, but the detailed endpoint also stores the render for inpainting (`store_for_inpainting`), and whether storage bills separately has not been checked. Presumed-equal is not measured, so this row stays its own row rather than aliasing the generate one.",
    checked: "2026-08-29",
  },
  {
    vendor: "elevenlabs",
    op: "sfx",
    model: "eleven_text_to_sound_v2",
    bills: "credits",
    // UNPRICED ON PURPOSE.
    source:
      "Never measured here, and NOT assumed to match music: text-to-sound is a different model on a different endpoint, and its requests run 0.5..30s where music runs 3s..600s. Fill it the same way — one call of known length, credit delta, divide.",
    checked: "2026-08-29",
  },
];

/** Which link of the unit chain a quote reached. */
export type MusicCostBasis =
  /** The vendor charges nothing for this operation, and a row says so. */
  | "free"
  /** Arithmetic over a declared rate. Our estimate, not a receipt. */
  | "estimated"
  /** No declared rate reaches money. The SECONDS are still exact. */
  | "unpriced";

export interface MusicQuote {
  /** Seconds of audio the call asks for. ALWAYS present and always exact —
   *  this is the one quantity in the chain nobody has to measure. */
  seconds: number;
  /** Vendor credits, when a credits-per-second rate is declared. */
  credits?: number;
  /** USD, when BOTH links of the chain are declared. Never a stand-in. */
  usd?: number;
  basis: MusicCostBasis;
  /** Where the figure came from, or why there is none. Safe to log or show. */
  note: string;
}

const rowFor = (op: MusicOp, model?: string): MusicPriceRow | undefined =>
  MUSIC_PRICES.find((p) => p.op === op && (model === undefined || p.model === model));

/**
 * What did (or will) this call cost, and how do we know?
 *
 * Walks the unit chain and stops at the first missing link, reporting what it
 * reached. A caller that gets `basis: "unpriced"` must render the word, never a
 * dollar figure and never $0.00 — an unpriced call is unpriced, not free, and
 * `free` is a separate basis precisely so the two can never be confused.
 */
export function priceCall(args: { op: MusicOp; model?: string; seconds: number }): MusicQuote {
  const { op, model } = args;
  const seconds = Number.isFinite(args.seconds) && args.seconds > 0 ? args.seconds : 0;
  const row = rowFor(op, model);

  if (!row)
    return {
      seconds,
      basis: "unpriced",
      note: `No price row is declared for elevenlabs/${op}${model ? `/${model}` : ""}. Add one to lib/music/pricing.ts with its source — do not guess one at the call site.`,
    };

  if (row.bills === "none")
    return {
      seconds,
      credits: 0,
      usd: 0,
      basis: "free",
      note: `Charged nothing. ${row.source} Checked ${row.checked}.`,
    };

  if (row.creditsPerSecond === undefined)
    return {
      seconds,
      basis: "unpriced",
      note:
        `${seconds}s of audio, at an undeclared rate. ElevenLabs bills music in CREDITS and no ` +
        `credits-per-second figure has been measured for ${row.op}, so this call has an exact ` +
        `duration and no price. ${row.source}`,
    };

  const credits = row.creditsPerSecond * seconds;
  if (row.usdPerCredit === undefined)
    return {
      seconds,
      credits,
      basis: "estimated",
      note:
        `${credits} credits (${seconds}s x ${row.creditsPerSecond}/s, checked ${row.checked}). ` +
        "USD is not declared: a credit is not a dollar and this operator's per-credit rate has not " +
        "been recorded. The credit figure is the real unit here; do not convert it.",
    };

  return {
    seconds,
    credits,
    usd: credits * row.usdPerCredit,
    basis: "estimated",
    note: `Estimated: ${seconds}s x ${row.creditsPerSecond} credits/s x $${row.usdPerCredit}/credit (${row.source} Checked ${row.checked}).`,
  };
}

/* ── The public half: what a surface may know BEFORE the click ─────────────── */
//
// Everything above prices a call. A surface about to spend needs the figure
// BEFORE the click, and it cannot import this file to get it (see the header),
// so the two functions below are the wire shape, served by
// app/api/music/pricing/route.ts.
//
// Derived from `MUSIC_PRICES` alone. Nothing here reads the environment, asks
// whether a key is configured, or consults the budget — a caller must not be
// able to work out from a price response what this deployment holds, and the
// cheapest way to guarantee that is to have nothing to leak.

/** A row as the wire carries it. Written longhand rather than spread, so a
 *  projection you must edit to widen cannot accidentally widen. */
export interface PublicMusicPrice {
  vendor: "elevenlabs";
  op: MusicOp;
  model: string;
  bills: MusicBillingUnit;
  creditsPerSecond?: number;
  usdPerCredit?: number;
  source: string;
  checked: string;
}

export interface MusicPriceTable {
  /** What ONE SECOND of rendered cue costs. See `estimatePerSecond`. */
  perSecond: MusicQuote;
  /** Every declared row, priced and unpriced alike. */
  prices: PublicMusicPrice[];
}

/**
 * The pre-click estimate, per second of audio.
 *
 * Deliberately per-second rather than per-call: a music call's size is chosen
 * by the picture, so the only figure a surface can multiply for ITS cue is a
 * rate. The surface multiplies by the seconds it is about to ask for and
 * renders whatever comes back — including, today, the word "unpriced".
 */
export function estimatePerSecond(): MusicQuote {
  return priceCall({ op: "generate", seconds: 1 });
}

/** The whole public table, and the one rate most callers actually want. */
export function priceTable(): MusicPriceTable {
  return {
    perSecond: estimatePerSecond(),
    prices: MUSIC_PRICES.map((p) => ({
      vendor: p.vendor,
      op: p.op,
      model: p.model,
      bills: p.bills,
      creditsPerSecond: p.creditsPerSecond,
      usdPerCredit: p.usdPerCredit,
      source: p.source,
      checked: p.checked,
    })),
  };
}
