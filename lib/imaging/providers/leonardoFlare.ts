// LEONARDO GPT IMAGE 2.5 FLARE — the API key's pool, reached over v2.
//
// Built for the first live /scout night (plan humble-soaring-wave, WP-A,
// 2026-10-22): the operator's ruling was "a commercial model only where needed,
// and then Flare". Until this file the app reached GPT Image 2.5 only through
// the browser studio (providers/leonardoStudio.ts, Sunburst over CDP), and the
// API row was Lucid Origin (providers/leonardo.ts).
//
// THE CONTRACT IS PORTED, NOT GUESSED. bp's look-dev client
// (kiro/bp/scripts/lookdev/leonardo.mjs) has driven this model over the API
// for 66 logged generations: POST /v2/generations with the model named and
// `public: false`, then GET /v1/generations/{id} every 5 s until COMPLETE or
// FAILED, giving up at 180 s. Its style id is bp's look and is not carried
// here; nothing else in the body is ours to invent.
//
// CREDIT-LEAN BY DECREE (operator, 2026-10-22: "no need for super HD"). LOW is
// the only quality this adapter sends, at the studio's SMALL size. The
// plan asked for 1024x576 (~0.59 MP); the API refused it on the first smoke
// (2026-10-22, 200 with VALIDATION_ERROR: "parameters.height must be one of:
// 640, 672, 768, 832, 848, 864, 896, 928, 1024, 1136, ..."), so the sizes below
// are the studio's SMALL presets (studio/selectors.ts: 16:9 SMALL is 1376x768),
// which bp measured at 6 credits for LOW at 1376x768 and 1024x1024. A higher
// tier is a later, explicit setting, not a parameter a caller can reach for.
//
// WHAT IT COST, IN THREE DESCENDING GRADES. The figure the API reports on the
// call (bp's log: every one of its 66 lines was `api`-sourced), else the
// difference in the account's token balance across the call, else the pricing
// table's fallback, labelled an estimate. Credits ride on the provenance
// beside the dollars, so a receipt can be checked against Leonardo's own
// ledger. The balance delta is racy against any other spend on the same key,
// which is why it reads "estimated" and never "vendor-reported".
//
// THE CLEANUP CONTRACT is providers/leonardo.ts's, for the same reason: this
// is the API pool, and its generations land in the operator's gallery. Each
// one is deleted in a `finally` once the pixels are held; a failed deletion is
// a note on the provenance, never the call's outcome.
//
// THE KEY never reaches a message, a detail or a provenance. Every vendor body
// passes `hide` before it is cut or quoted (bp learned why: a reply cut through
// the key leaves a prefix no later redaction can match).

import { sleep as realSleep } from "../../sleep";
import { ImagingError, invalidRequest } from "../errors";
import { keyFor } from "../env";
import { fetchImageBase64, requestJson } from "../http";
import { logCleanupFailure, scrub } from "../log";
import { priceCall } from "../pricing";
import type { Resolver } from "../safeUrl";
import type { Aspect, CostBasis, GenerateRequest, GeneratedImages, ImageRef, ImagingProvider, Provenance } from "../types";
import { USD_PER_CREDIT } from "../video/pricing";

const API = "https://cloud.leonardo.ai/api/rest";

export const FLARE_MODEL = "openai/gpt-image-2.5-flare";
export const FLARE_QUALITY = "LOW";

/**
 * The request size by aspect: every side from the API's own list. 16:9 and 1:1
 * are measured (bp's log; this repo's smoke of 2026-10-22: 1376x768 LOW, 6
 * credits reported by the API, 15 s end to end); 9:16 is 16:9 on its
 * side and 4:5 the nearest pair of listed sides, both unmeasured as pairs.
 * 1376x768 is 1.79:1 against 16:9's 1.78, the studio's own rounding.
 */
export const FLARE_PX: Readonly<Record<Aspect, { readonly w: number; readonly h: number }>> = {
  "16:9": { w: 1376, h: 768 },
  "9:16": { w: 768, h: 1376 },
  "1:1": { w: 1024, h: 1024 },
  "4:5": { w: 1024, h: 1280 },
};

/** v2's prompt ceiling (providers/leonardo.ts: "the v2 endpoint allows 2000"). */
const MAX_PROMPT_CHARS = 2000;
const POLL_MS = 5_000;
const LIMIT_MS = 180_000;

/** Where a provenance's credit figure came from. */
export type FlareCreditsSource = "api" | "balance" | "fallback";

/** The Flare receipt, carried beside the contract's fields (as StudioProvenance does). */
export interface FlareProvenance extends Provenance {
  credits: number;
  creditsSource: FlareCreditsSource;
}

/** Credits a served Flare generation spent, or undefined for any other provider's result. */
export function flareCreditsOf(p: Provenance): number | undefined {
  return p.provider === "leonardo-flare" ? (p as Partial<FlareProvenance>).credits : undefined;
}

/** The test seams: a fake resolver for the CDN download, and no real sleeping. */
export interface FlareOptions {
  readonly resolve?: Resolver;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollMs?: number;
  readonly limitMs?: number;
}

type Json = Record<string, unknown>;

const isObj = (x: unknown): x is Json => typeof x === "object" && x !== null && !Array.isArray(x);

/** `text` with the key and anything credential-shaped removed. */
function hide(text: string, key: string): string {
  return scrub(key ? text.split(key).join("[redacted]") : text);
}

/** Every `message` / `error` / `detail` string in a body, outermost first, once each. */
function sentencesIn(j: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  if (Array.isArray(j)) for (const x of j) sentencesIn(x, out, depth + 1);
  else if (isObj(j)) {
    for (const k of ["error", "message", "detail"]) {
      const v = j[k];
      if (typeof v === "string" && v.trim() !== "" && !out.includes(v.trim())) out.push(v.trim());
    }
    for (const v of Object.values(j)) if (typeof v === "object") sentencesIn(v, out, depth + 1);
  }
  return out;
}

/**
 * The vendor's own words out of a body: every message it carries, joined, else
 * the raw text. v2 answers a bad request with a 200 holding a GraphQL-style
 * error array whose useful sentence sits three levels down
 * (`[0].extensions.details.errors[0].message`), hence the walk.
 */
export function vendorSentence(detail: unknown, key: string, max = 600): string {
  const raw = hide(typeof detail === "string" ? detail : JSON.stringify(detail ?? ""), key);
  let said = raw;
  try {
    const found = sentencesIn(JSON.parse(raw));
    if (found.length > 0) said = found.join(" | ");
  } catch {
    // Not JSON: the raw body is the sentence.
  }
  return said.replace(/\s+/g, " ").trim().slice(0, max);
}

/** An ImagingError from http.ts, its body made safe and its sentence put where a reader looks. */
function vendorError(e: unknown, key: string, what: string): ImagingError {
  if (!(e instanceof ImagingError)) return new ImagingError(`Leonardo Flare ${what} failed: ${hide(String(e), key)}`, "failed", "leonardo-flare");
  const said = e.detail === undefined ? "" : vendorSentence(e.detail, key);
  const out = new ImagingError(
    hide(said ? `${e.message} Leonardo said: ${said}` : e.message, key),
    e.kind,
    "leonardo-flare",
    e.detail === undefined ? undefined : hide(typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail), key).slice(0, 600),
  );
  out.dispatched = e.dispatched;
  return out;
}

/** A credit or dollar amount the API states itself, as `{ credits }` or `{ usd }`. */
type Reported = { readonly credits: number } | { readonly usd: number };

const DOLLARS = new Set(["DOLLARS", "DOLLAR", "USD"]);
const CREDITS = new Set(["CREDITS", "CREDIT", "TOKENS"]);

function amountOf(v: unknown, unit: unknown): Reported | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined; // a missing figure is never a zero one
  const u = unit === undefined || unit === null ? "CREDITS" : String(unit).toUpperCase();
  if (DOLLARS.has(u)) return { usd: n };
  if (CREDITS.has(u)) return { credits: n };
  return undefined; // an unknown unit is unpriced, never assumed (providers/leonardo.ts costUsdFrom)
}

/**
 * The cost the API reports on a response, if it does. The known places first
 * (v2 nests the job under `generate` with `cost: {amount, unit}`, the legacy
 * `apiCreditCost` beside it), then bp's walk: any field named like cost or
 * credit, four levels deep.
 */
export function reportedCost(obj: unknown, depth = 0): Reported | undefined {
  if (!isObj(obj) || depth > 4) return undefined;
  const gen = isObj(obj.generate) ? obj.generate : undefined;
  if (depth === 0 && gen !== undefined) {
    const c = isObj(gen.cost) ? amountOf(gen.cost.amount, gen.cost.unit) : amountOf(gen.cost, undefined);
    const known = c ?? amountOf(gen.apiCreditCost, undefined);
    if (known !== undefined) return known;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (!/cost|credit/i.test(k)) continue;
    const got = isObj(v) ? amountOf(v.amount, v.unit) : typeof v === "number" || typeof v === "string" ? amountOf(v, /dollar/i.test(k) ? "USD" : undefined) : undefined;
    if (got !== undefined) return got;
  }
  for (const v of Object.values(obj)) {
    const got = reportedCost(v, depth + 1);
    if (got !== undefined) return got;
  }
  return undefined;
}

/** Sum of every numeric token pool on the account, or null when it cannot be read. */
async function balance(headers: Record<string, string>): Promise<number | null> {
  try {
    const me = await requestJson<Json>("leonardo-flare", `${API}/v1/me`, { headers, attempts: 1, timeoutMs: 20_000 });
    const details = Array.isArray(me?.user_details) ? me.user_details[0] : undefined;
    if (!isObj(details)) return null;
    const pools = Object.entries(details).filter(([k, v]) => /tokens$/i.test(k) && typeof v === "number");
    return pools.length === 0 ? null : pools.reduce((n, [, v]) => n + (v as number), 0);
  } catch {
    return null;
  }
}

/** The fallback's credits: the row in pricing.ts is 6 x USD_PER_CREDIT (bp's worst LOW figure under 1.1 MP). */
export const FLARE_FALLBACK_CREDITS = 6;

type Cost = { readonly costUsd?: number; readonly costBasis: CostBasis; readonly credits: number; readonly creditsSource: FlareCreditsSource };

function costOf(reported: Reported | undefined, before: number | null, after: number | null): Cost {
  if (reported !== undefined) {
    const usd = "usd" in reported ? reported.usd : reported.credits * USD_PER_CREDIT;
    const credits = "credits" in reported ? reported.credits : Math.round((reported.usd / USD_PER_CREDIT) * 100) / 100;
    const q = priceCall({ provider: "leonardo-flare", model: FLARE_MODEL, vendorUsd: usd });
    return { costUsd: q.usd, costBasis: q.basis, credits, creditsSource: "api" };
  }
  if (before !== null && after !== null && before - after > 0) {
    const credits = before - after;
    return { costUsd: credits * USD_PER_CREDIT, costBasis: "estimated", credits, creditsSource: "balance" };
  }
  const q = priceCall({ provider: "leonardo-flare", model: FLARE_MODEL, images: 1 });
  return { ...(q.usd === undefined ? {} : { costUsd: q.usd }), costBasis: q.basis, credits: FLARE_FALLBACK_CREDITS, creditsSource: "fallback" };
}

/** The v2 body, exported so a test reads the same object the wire does. */
export function flareBody(req: Pick<GenerateRequest, "prompt" | "negativePrompt" | "aspect" | "seed">): Json {
  const { w, h } = FLARE_PX[req.aspect];
  const neg = req.negativePrompt?.trim();
  const prompt = neg ? `${req.prompt.trim()}\n\nAvoid: ${neg}.` : req.prompt;
  return {
    model: FLARE_MODEL,
    public: false,
    parameters: {
      width: w,
      height: h,
      prompt_enhance: "OFF",
      quality: FLARE_QUALITY,
      quantity: 1,
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
      prompt,
    },
  };
}

const REFUSED = new Set(["NSFW", "CONTENT_FILTERED", "MODERATED", "BLOCKED"]);

export function leonardoFlareProvider(o: FlareOptions = {}): ImagingProvider {
  const wait = o.sleep ?? realSleep;
  const pollMs = o.pollMs ?? POLL_MS;
  const maxPolls = Math.max(1, Math.ceil((o.limitMs ?? LIMIT_MS) / pollMs));
  return {
    id: "leonardo-flare",
    capabilities: ["generate"],
    // The v2 body this adapter sends carries no image guidance.
    supportsReferences: false,
    // GPT Image takes one prompt; a negative is a sentence inside it.
    negativePromptChannel: "prose",

    async generate(req: GenerateRequest): Promise<GeneratedImages> {
      const started = Date.now();
      // One image per call: one start, one receipt, one id to delete.
      if ((req.count ?? 1) !== 1) throw invalidRequest("leonardo-flare", "Leonardo Flare makes one image per request here; ask for count 1.");
      const body = flareBody(req);
      const prompt = String((body.parameters as Json).prompt);
      if (prompt.length > MAX_PROMPT_CHARS)
        throw invalidRequest("leonardo-flare", `The prompt is ${prompt.length} characters; Leonardo v2 accepts ${MAX_PROMPT_CHARS}. Shorten it or the negative prompt.`);
      const key = keyFor("leonardo-flare");
      const headers = { authorization: `Bearer ${key}` };
      const { w, h } = FLARE_PX[req.aspect];

      const before = await balance(headers);
      let start: unknown;
      try {
        start = await requestJson<unknown>("leonardo-flare", `${API}/v2/generations`, { method: "POST", billable: true, headers, body });
      } catch (e) {
        throw vendorError(e, key, "start");
      }
      const gen = isObj(start) && isObj(start.generate) ? start.generate : isObj(start) ? start : {};
      const id = [gen.generationId, gen.id].find((x): x is string => typeof x === "string" && x !== "");
      if (id === undefined) {
        // A refusal in a 200 (a validation error array) is the vendor's sentence and a plain
        // failure; a body that is neither a job nor an error is one we cannot read.
        const refusal = Array.isArray(start) || (isObj(start) && Array.isArray(start.errors));
        const err = new ImagingError(
          refusal ? `Leonardo Flare refused the request: ${vendorSentence(start, key)}` : `Leonardo Flare accepted the request but returned no generation id: ${vendorSentence(start, key, 300)}`,
          refusal ? "failed" : "bad-response",
          "leonardo-flare",
          hide(JSON.stringify(start), key).slice(0, 600),
        );
        err.dispatched = true;
        throw err;
      }
      let reported = reportedCost(start);

      let images: ImageRef[] = [];
      let cleanup: "deleted" | "failed" = "failed";
      try {
        const done = await poll(id, headers, key);
        reported ??= reportedCost(done.job);
        const { base64, mime } = await fetchImageBase64("leonardo-flare", done.url, 60_000, o.resolve);
        images = [{ base64, mime: mime as ImageRef["mime"], width: w, height: h }];
      } finally {
        cleanup = await deleteGeneration(id, headers);
      }

      const after = reported === undefined ? await balance(headers) : null;
      const cost = costOf(reported, before, after);
      const provenance: FlareProvenance = {
        provider: "leonardo-flare",
        model: FLARE_MODEL,
        // Our request named it; the poll's answer does not echo a model id.
        modelBasis: "requested",
        remoteIds: [id],
        ...(cost.costUsd === undefined ? {} : { costUsd: cost.costUsd }),
        costBasis: cost.costBasis,
        durationMs: Date.now() - started,
        cleanup,
        credits: cost.credits,
        creditsSource: cost.creditsSource,
      };
      return { images, provenance };
    },
  };

  async function poll(id: string, headers: Record<string, string>, key: string): Promise<{ url: string; job: Json }> {
    for (let i = 0; i < maxPolls; i++) {
      await wait(pollMs);
      let res: Json;
      try {
        res = await requestJson<Json>("leonardo-flare", `${API}/v1/generations/${encodeURIComponent(id)}`, { headers, attempts: 1 });
      } catch {
        continue; // one bad poll is not a failed generation
      }
      const job = isObj(res.generations_by_pk) ? res.generations_by_pk : isObj(res.generation) ? res.generation : {};
      const status = String(job.status ?? "").toUpperCase();
      if (REFUSED.has(status)) throw new ImagingError(`Leonardo Flare declined generation ${id} (${status}): ${vendorSentence(job, key, 300)}`, "refused", "leonardo-flare");
      if (status === "FAILED") {
        const err = new ImagingError(`Leonardo Flare reported generation ${id} FAILED: ${vendorSentence(job, key, 300)}`, "failed", "leonardo-flare");
        err.dispatched = true;
        throw err;
      }
      if (status === "COMPLETE") {
        const list = Array.isArray(job.generated_images) ? job.generated_images : [];
        const url = list.map((g) => (isObj(g) ? g.url : undefined)).find((u): u is string => typeof u === "string" && u !== "");
        if (url === undefined) throw new ImagingError(`Leonardo Flare reported generation ${id} COMPLETE with no image.`, "bad-response", "leonardo-flare");
        return { url, job };
      }
    }
    throw new ImagingError(`Leonardo Flare did not finish generation ${id} within ${Math.round((maxPolls * pollMs) / 1000)} s.`, "timeout", "leonardo-flare");
  }
}

/** Remove the generation from the operator's gallery. Never throws (providers/leonardo.ts). */
async function deleteGeneration(id: string, headers: Record<string, string>): Promise<"deleted" | "failed"> {
  try {
    await requestJson("leonardo-flare", `${API}/v1/generations/${encodeURIComponent(id)}`, { method: "DELETE", headers, attempts: 2, timeoutMs: 20_000 });
    return "deleted";
  } catch (e) {
    logCleanupFailure("leonardo-flare", id, e);
    return "failed";
  }
}
