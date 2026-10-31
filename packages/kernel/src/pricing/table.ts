import { z } from "zod";

// THE PRICE TABLE - one table, one authority, every medium (plan §3.2).
//
// v1 kept four: lib/imaging/pricing.ts (per image), lib/text/pricing.ts (per
// million tokens, in and out), lib/music/pricing.ts (credits per second of
// audio, keyed by endpoint) and lib/imaging/video/pricing.ts (per clip and
// duration). They shared one law, stated in each header in nearly the same
// words, and this file keeps it verbatim:
//
//   NEVER INVENT A PRICE. A row either carries a figure WITH the source it came
//   from and the date that source was checked, or carries no figure and the
//   reason there is none. An absent `usd` is a decision, not an omission - read
//   the `source` line. An unpriced call is UNPRICED, never free.
//
// What merging bought (cost-metering: price-tables, "one table, one authority"):
//   - ONE KEY, (provider, model, unit). The imaging table and the text table
//     both carried google/gemini-3.6-flash - recognition is a per-token call on
//     the same model the text router reasons with - and the two rows said the
//     same thing in two places. Here it is one row per direction.
//   - THE DENOMINATION IS PART OF THE ROW (`per`), not a convention in a field
//     name (`usdPerMInput`): off-by-a-million is unfindable by inspection.
//   - A DATED RATE ENDS. gemini-3.8-flash's rate is introductory and its own
//     source says it doubles on 2027-01-01; v1 wrote that in prose and trusted
//     a reader to notice. `validUntil` makes the quote unpriced from that day.
//
// Music rows keep v1's endpoint split inside the model id (`music_v2/compose`):
// lib/music/pricing.ts keyed on the operation because one model bills
// differently per endpoint, and a table keyed by model alone would merge a
// declared-free endpoint with an unmeasured one.
//
// ENV-FREE AND IMPORT-FREE apart from the schema, as every v1 copy was: the
// table can be handed to a browser without saying which keys this box holds.

// `audio-input-token` is its own unit, not `input-token`: a vendor that tokenises audio prices it
// apart from text on most of its models (ai.google.dev/gemini-api/docs/pricing lists "(audio)" input
// rows beside "(text / image / video)" ones), so a listen quoted at the text rate is an invented price
// wherever the two differ. A model whose page states one rate for every modality gets both rows.
export const PRICE_UNITS = ["image", "input-token", "output-token", "audio-input-token", "audio-second", "character", "clip-5s", "clip-10s"] as const;
export const priceUnitSchema = z.enum(PRICE_UNITS);
export type PriceUnit = z.output<typeof priceUnitSchema>;

const isoDate = z.iso.date();

export const priceRowSchema = z
  .object({
    provider: z.string().min(1),
    /** Exact model id as it goes on the wire, and as it lands in provenance. */
    model: z.string().min(1),
    unit: priceUnitSchema,
    /** USD per `per` units. Absent = deliberately unpriced; `source` says why. */
    usd: z.number().nonnegative().optional(),
    per: z.number().int().positive(),
    /** The request size the figure was measured at; any other size is unpriced. */
    atSize: z.string().min(1).optional(),
    /** The last day the figure holds, when the vendor published one. */
    validUntil: isoDate.optional(),
    /** How we know, or why we do not. Required on every row. */
    source: z.string().min(20),
    checked: isoDate,
  })
  .refine((r) => r.usd !== undefined || (r.atSize === undefined && r.validUntil === undefined), {
    message: "an unpriced row carries no size or expiry: there is no figure for them to qualify",
  });
export type PriceRow = z.output<typeof priceRowSchema>;

const M = 1_000_000;

const textUnpriced = (provider: string, model: string, source: string, checked: string): PriceRow[] => [
  { provider, model, unit: "input-token", per: M, source, checked },
  { provider, model, unit: "output-token", per: M, source, checked },
];

const clipRows = (model: string): PriceRow[] =>
  (["clip-5s", "clip-10s"] as const).map((unit) => ({
    provider: "leonardo",
    model,
    unit,
    per: 1,
    source:
      "Unpriced: Leonardo bills hosted video in API credits per generation and no per-model, per-duration figure could be read from a Leonardo source (2026-10-06: the pricing page answered 404). The vendor reports its own cost per call (lib/imaging/video/pricing.ts).",
    checked: "2026-10-06",
  }));

export const PRICE_TABLE: readonly PriceRow[] = [
  /* ── image (lib/imaging/pricing.ts) ───────────────────────────────────── */
  {
    provider: "google",
    model: "gemini-3.1-flash-image",
    unit: "image",
    usd: 0.045,
    per: 1,
    atSize: "1K",
    source:
      "MEASURED in this repo: 30 Google cells of the style-trial grid at 1K, 16:9 - $0.0450/render (docs/imaging.md, The provider verdict). Our spend over our render count, not a rate card.",
    checked: "2026-08-13",
  },
  {
    provider: "google",
    model: "gemini-3.1-flash-lite-image",
    unit: "image",
    per: 1,
    source:
      "Never measured here: the repo runs the full model, because Lite supports object references only and cannot hold style-lock. 'Cheaper' is not a number; measure a batch or read Google's rate card.",
    checked: "2026-08-14",
  },
  {
    provider: "leonardo",
    model: "lucid-origin",
    unit: "image",
    usd: 0.0257,
    per: 1,
    source:
      "MEASURED in this repo: 30 Leonardo cells of the same grid at 1472x832 - $0.0257/render, the 10-credit charge at USD_PER_CREDIT 0.00257. Fallback only: Leonardo reports its own cost and a reported figure always outranks this one.",
    checked: "2026-08-13",
  },
  {
    provider: "ollama",
    model: "qwen3.8:27b",
    unit: "image",
    usd: 0,
    per: 1,
    source:
      "Local inference on this box's own GPU. The electricity is real but nobody invoices it; $0 is the vendor-billed truth, and the point of the provider.",
    checked: "2026-09-01",
  },
  ...(["qwen3.8-max", "qwen3.7-plus", "qwen3.6-flash"] as const).map(
    (model): PriceRow => ({
      provider: "qwen",
      model,
      unit: "input-token",
      per: M,
      source:
        "DashScope bills per token against a prepaid balance, and the three SKUs the adapter rotates through bill at different rates against separate allowances. No USD-per-token rate has been checked against Alibaba's card.",
      checked: "2026-08-14",
    }),
  ),
  {
    provider: "agy",
    model: "agy-image-generator",
    unit: "image",
    per: 1,
    source:
      "Billed against the operator's own `agy` CLI plan quota, not a per-call USD figure; no rate card has been checked, and a price here would describe one machine's plan.",
    checked: "2026-10-04",
  },
  {
    provider: "leonardo-studio",
    model: "openai/gpt-image-2.5-sunburst",
    unit: "image",
    per: 1,
    source:
      "Billed in Leonardo STUDIO credits from the operator's prepaid plan (71 credits for one 1376x768 High image, read 2026-10-12 off the studio's button), a separate pool from the API's. No USD-per-studio-credit rate has been checked.",
    checked: "2026-10-12",
  },
  {
    provider: "leonardo-flare",
    model: "openai/gpt-image-2.5-flare",
    unit: "image",
    usd: 0.01542,
    per: 1,
    source:
      "MEASURED in the bp repo's look-dev log (66 API-reported calls): LOW is 6 credits at 1376x768 and 1024x1024, 8 at 2048x768; 6 credits at USD_PER_CREDIT 0.00257. Fallback only: the API reports credits per call and a reported figure always outranks this one.",
    checked: "2026-10-22",
  },

  /* ── text (lib/text/pricing.ts), plus imaging's recognition row ──────── */
  ...textUnpriced(
    "claude-cli",
    "claude-opus-5",
    "No table figure is used: the CLI reports total_cost_usd per run in its own result envelope, so every local turn carries a vendor-reported figure. If the envelope ever stops carrying it, THIS is the row to fill.",
    "2026-08-27",
  ),
  ...textUnpriced(
    "google",
    "gemini-3.6-flash",
    "Reachable, unpriced. Token counts arrive on every call (live 2026-08-27: in=20 out=27 thoughts=345); only the per-token RATE is unread. Serves text turns and image recognition alike (lib/imaging/pricing.ts said the same of recognition). Fill from ai.google.dev/pricing.",
    "2026-08-27",
  ),
  ...textUnpriced(
    "google",
    "gemini-3.1-pro-preview",
    "Reachable, unpriced - same state and remedy as gemini-3.6-flash. Serves the plan-class turns and bills at a different rate; its thinking runs ~25x the visible answer, which the adapter adds into output tokens.",
    "2026-08-27",
  ),
  ...textUnpriced(
    "google",
    "gemini-3.7-flash",
    "Not in service here: the 2026-08-27 pass got HTTP 503 'high demand' after 9.8s. Kept so promoting it is an edit to a table that already knows it, and the 503 is recorded rather than rediscovered.",
    "2026-08-27",
  ),
  {
    provider: "google",
    model: "gemini-3.8-flash",
    unit: "input-token",
    usd: 0.75,
    per: M,
    validUntil: "2026-12-31",
    source:
      "The vendor's own published rate (blog.google and ai.google.dev, 2026-09-02). INTRODUCTORY: it doubles to 1.50 on 2027-01-01. Not in service here until the live pass is re-run against 3.8.",
    checked: "2026-09-02",
  },
  {
    provider: "google",
    model: "gemini-3.8-flash",
    unit: "output-token",
    usd: 3.75,
    per: M,
    validUntil: "2026-12-31",
    source:
      "The vendor's own published rate (2026-09-02). INTRODUCTORY: it doubles to 7.50 on 2027-01-01. Re-measure the thoughts multiplier before promoting: at a fixed rate that ratio is the whole cost story.",
    checked: "2026-09-02",
  },
  {
    // The listener's audio (lib/sound/suno/listen.ts, turn `suno-listen`): 32 tokens per second of
    // audio (ai.google.dev/gemini-api/docs/audio, "Technical details about audio", read 2026-10-29).
    provider: "google",
    model: "gemini-3.8-flash",
    unit: "audio-input-token",
    usd: 0.75,
    per: M,
    validUntil: "2026-12-31",
    source:
      "ai.google.dev/gemini-api/docs/pricing, read 2026-10-29 (page 'Last updated 2026-10-28 UTC'): Gemini 3.8 Flash, Standard, Paid Tier, 'Input price' '$0.75 through December 31, 2026. $1.50 starting January 1, 2027.' with NO modality qualifier, where the same page splits audio out for the models that bill it apart (3.1 Flash-Lite '$0.25 (text / image / video)' and '$0.50 (audio)'). So audio input bills at the input rate on this model. INTRODUCTORY: 1.50 from 2027-01-01.",
    checked: "2026-10-29",
  },

  /* ── audio (lib/music/pricing.ts): seconds exact, money not ──────────── */
  {
    provider: "elevenlabs",
    model: "music_v2/plan",
    unit: "audio-second",
    usd: 0,
    per: 1,
    source:
      "A DECLARED zero: the composition-plan endpoint costs no credits (vendor docs resolved 2026-08-26, recorded at lib/music/elevenlabs.ts draftPlan). Rate-limited, not metered.",
    checked: "2026-08-26",
  },
  {
    provider: "elevenlabs",
    model: "music_v2/generate",
    unit: "audio-second",
    per: 1,
    source:
      "Never measured here: music bills against a CREDIT balance and no cue has been rendered with the balance read before and after. Render one cue of known length, read the credit delta, divide, and record both with the date.",
    checked: "2026-08-29",
  },
  {
    provider: "elevenlabs",
    model: "music_v2/compose",
    unit: "audio-second",
    per: 1,
    source:
      "Same endpoint family as generate and presumed to bill alike, but it also stores the render for inpainting and whether storage bills separately is unchecked. Presumed-equal is not measured.",
    checked: "2026-08-29",
  },
  {
    provider: "elevenlabs",
    model: "eleven_text_to_sound_v2",
    unit: "audio-second",
    per: 1,
    source:
      "Never measured here, and NOT assumed to match music: a different model on a different endpoint, 0.5..30 s per request where music runs 3..600 s. Fill it the same way: one call of known length, credit delta, divide.",
    checked: "2026-08-29",
  },

  /* ── speech (lib/music/elevenlabs.ts `speak`): characters exact, and priced ── */
  {
    provider: "elevenlabs-voice",
    model: "eleven_multilingual_v2",
    unit: "character",
    usd: 0.08,
    per: 1000,
    source:
      "The vendor's own API rate card, elevenlabs.io/pricing/api, read 2026-10-24: Text to Speech, v2 Multilingual, $0.08 per 1K characters, the same rate on every tier (plans differ only in characters included), billed in US dollars, not credits, per character of the request's text. An estimate of the bill, not a receipt: the TTS response reports no cost, and characters a plan includes cost less than this.",
    checked: "2026-10-24",
  },

  /* ── video (lib/imaging/video/pricing.ts) ─────────────────────────────── */
  ...clipRows("kling-2-5"),
  ...clipRows("hailuo-03"),
  ...clipRows("veo-3"),
];

export const rowKey = (r: Pick<PriceRow, "provider" | "model" | "unit">): string => `${r.provider}\u0000${r.model}\u0000${r.unit}`;

export function findRow(table: readonly PriceRow[], provider: string, model: string, unit: PriceUnit): PriceRow | undefined {
  return table.find((r) => r.provider === provider && r.model === model && r.unit === unit);
}
