// GOOGLE — the cloud engine, and the only one that can answer on Cloud Run.
//
// THE SURFACE IS GOOGLE AI STUDIO (`generativelanguage.googleapis.com`), not
// Vertex AI, and that is a decision rather than a default. It is the exact
// surface lib/imaging/providers/google.ts already speaks, so this app holds ONE
// Google credential (`GOOGLE_AI_API_KEY`) and one auth model across both
// engines. Vertex would mean a service account, a region, ADC and a new
// dependency — a second auth model for one product — and it buys nothing this
// seam needs today. The shape below is kept transport-agnostic (`BASE` is a
// variable, auth is a single header) so a Vertex path is a second base URL and a
// bearer, not a rewrite.
//
// ── THE DATED CAPABILITY ────────────────────────────────────────────────────
//
// `enforcesSchema: true`. The `generateContent` API takes
// `generationConfig.responseSchema` alongside `responseMimeType:
// "application/json"` and constrains decoding to it. This is the capability that
// makes the cloud rung a genuine UPGRADE over the local one rather than a
// consolation: /api/recalibrate's header names "the plan's shape is a REQUEST,
// not a guarantee" as a cost it pays for the CLI engine, and on this rung it
// does not pay it.
//
// WITH ONE HONEST CAVEAT, which `toResponseSchema` below exists to handle.
// `responseSchema` accepts an OpenAPI-3.0 SUBSET of JSON Schema — no `$schema`,
// no `additionalProperties`, no `oneOf`/`allOf`/`$ref`, no `const`. This app's
// EDIT_PLAN_SCHEMA is authored as plain JSON Schema for a different consumer.
// So the translation is attempted, and when it would LOSE something the answer
// is not to send a quietly weakened schema and report `native` — that is a claim
// of enforcement that was not performed. It is to fall back to prompted
// enforcement for that request and say so in the receipt.
//
// Verified 2026-08-27 against the documented request shape. NOT verified against
// a live call: there is no GOOGLE_AI_API_KEY on the machine this was written on,
// so no turn has ever been served by this adapter. That is stated here, in
// .env.example and in .ai/manifest.yaml rather than being left for someone to
// discover — the repo's rule is that `verified` is a claim something has
// actually run, and nothing has.

import { invalidRequest, TextError } from "../errors";
import { keyFor } from "../env";
import { postJson } from "../http";
import { schemaInstruction } from "../json";
import { priceTurn } from "../pricing";
import type { ProbeResult, TextProvider, TextRequest, TextResult, SchemaEnforcement } from "../types";

const BASE = process.env.GOOGLE_TEXT_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta";

/**
 * Which model answers which turn.
 *
 * Per the registry's model-routing/turn-classification technique: the turn class
 * is what a routing rule keys on, so the mapping lives in a table rather than in
 * a ternary at the call site.
 *
 * `edit-plan` gets the pro tier and `scene-direction` the flash tier, and that
 * split is a CAPABILITY FLOOR rather than a cost preference. An edit plan is
 * validated, applied to a creator's manuscript and persisted as a version; it is
 * the turn where a weaker model's output is expensive to discover. Scene
 * direction is reviewed frame by frame in the Lightbox before anything is
 * generated from it, so a weaker answer is caught by a human at the next step.
 * `probe` is deliberately the cheapest thing on the roster — a health check that
 * routes like production traffic is a health check nobody runs.
 */
/**
 * MEASURED AGAINST THE LIVE ROSTER on 2026-08-27 with this repo's key, not
 * chosen from memory. `models.list` returned 52 models, 38 with
 * `generateContent`, and each id below was called with a real schema-constrained
 * request. What that pass actually found:
 *
 *   gemini-3.6-flash        200 · 4.7s · native schema honoured   ← scene-direction
 *   gemini-3.1-pro-preview  200 · 15.5s · native schema honoured  ← edit-plan
 *   gemini-3.7-flash        503 "experiencing high demand"        — newest, not dependable
 *   gemini-pro-latest       200 · 63.3s · a FLOATING ALIAS        — see below
 *   gemini-2.5-pro          404 "no longer available to new users. Please update
 *                           your code to use models/gemini-3.1-pro-preview"
 *
 * The first draft of this table named `gemini-3.6-pro`, which does not exist on
 * the roster at all — every edit-plan turn would have 404'd. That is exactly the
 * failure the registry's dated-capability-matrix technique exists to prevent,
 * and it is why these ids are now a measurement with a date rather than a guess.
 *
 * `gemini-pro-latest` is deliberately NOT used despite working. It is an alias
 * that moves under you, and `model-routing/model-identity` is explicit about the
 * cost: "measured history resets when a roster label changes". A turn whose
 * price and latency this app records has to name a model that means the same
 * thing next week. It was also four times slower than the pinned id in this pass.
 *
 * `gemini-3.7-flash` is the newest flash and is left out for today: a 503 under
 * load is a bad property for the only engine a hosted deployment has. Promote it
 * by editing this table and re-running the pass, not by assuming it settled.
 *
 * 2026-09-02 — `gemini-3.8-flash` shipped and is NOT promoted here, deliberately,
 * under that same rule: no pass has been run against it with this repo's key, and
 * this table's ids are a measurement with a date rather than a guess. The pass is
 * OWED, and it is cheap; what it has to answer is two things, not one.
 *
 *   1. Did the 503 follow the version? The property that disqualified 3.7 was
 *      capacity under load, which is not a property a version bump necessarily
 *      carries either way. It has to be observed.
 *   2. What is the thoughts ratio? The vendor states 3.8 "works harder" — extra
 *      reasoning steps and iterative tool calls, at the API default of
 *      thinking_level=high — at the SAME per-token price as 3.7. Since this
 *      adapter bills thoughtsTokenCount as output (see below: 3.6 measured 345
 *      thinking tokens against a 27-token answer, 12.8x), an unchanged rate does
 *      not mean an unchanged bill. Re-measure the ratio in the same pass; it is
 *      the number that decides whether 3.8 is cheaper or dearer HERE, and the
 *      vendor's own advice for efficiency-first work is to stay on the older id.
 *
 * lib/text/pricing.ts already carries a priced 3.8 row so that promotion is an
 * edit to a table that knows the rate, and records that the rate is introductory
 * and doubles on 2027-01-01.
 */
const MODEL_FOR_TURN: Record<TextRequest["turn"], string> = {
  "edit-plan": process.env.GOOGLE_TEXT_MODEL_PLAN?.trim() || "gemini-3.1-pro-preview",
  "scene-direction": process.env.GOOGLE_TEXT_MODEL?.trim() || "gemini-3.6-flash",
  "style-synthesis": process.env.GOOGLE_TEXT_MODEL?.trim() || "gemini-3.6-flash",
  probe: process.env.GOOGLE_TEXT_MODEL?.trim() || "gemini-3.6-flash",
};

/** The documented ceiling on a single inline request body. Checked here so an
 *  over-long prompt is a clear 400 naming the limit, before dispatch and before
 *  any bill, rather than a vendor 400 that invites a retry failing identically
 *  forever. */
const MAX_PROMPT_CHARS = 900_000;

/** JSON Schema keywords `responseSchema` does not accept. Presence of any one of
 *  them means the translation would silently drop a constraint. */
const UNSUPPORTED_KEYWORDS = [
  "$schema",
  "$ref",
  "$defs",
  "definitions",
  "oneOf",
  "allOf",
  "anyOf",
  "not",
  "const",
  "additionalProperties",
  "patternProperties",
  "if",
  "then",
  "else",
] as const;

/**
 * Can this schema be enforced natively, and if so as what?
 *
 * Returns the translated schema, or `null` when translation would lose a
 * constraint. `null` is not a failure — it is the honest answer that this
 * particular schema has to be enforced by prompt-and-validate instead, and the
 * caller reports `prompted` because that is what happened.
 *
 * The check is a deep keyword scan rather than a shallow one because a `oneOf`
 * three levels down is exactly as unenforceable as one at the root, and a
 * translation that only looked at the top level would report `native` for a
 * schema whose real constraints were dropped.
 */
export function toResponseSchema(schema: Record<string, unknown>): Record<string, unknown> | null {
  let lost = false;

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if ((UNSUPPORTED_KEYWORDS as readonly string[]).includes(k)) {
        // `$schema` and `additionalProperties: false` are the two that carry no
        // meaning worth preserving — a dialect declaration and a closed-world
        // assertion the vendor makes anyway. Dropping either loses nothing, so
        // they do not spoil native enforcement. Everything else does.
        if (k === "$schema" || k === "additionalProperties") continue;
        lost = true;
        continue;
      }
      out[k] = walk(v);
    }
    return out;
  };

  const translated = walk(schema) as Record<string, unknown>;
  return lost ? null : translated;
}

interface GenerateContentResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    /**
     * THINKING TOKENS, AND THEY ARE BILLED AS OUTPUT.
     *
     * Every model on this roster reasons before it answers, and the reasoning is
     * not in `candidatesTokenCount`. The 2026-08-27 pass measured the gap and it
     * is not a rounding error:
     *
     *   gemini-3.6-flash        in=20  out=27  thoughts=345   (12.8× the answer)
     *   gemini-3.1-pro-preview  in=20  out=27  thoughts=679   (25.1× the answer)
     *
     * A price computed from `candidatesTokenCount` alone would therefore
     * understate a turn's real output cost by an order of magnitude — on the one
     * figure /api/recalibrate persists onto a creator's version. This field is
     * read and added to output below; a model that reports none contributes zero,
     * which is correct rather than merely convenient.
     */
    thoughtsTokenCount?: number;
  };
}

export function googleProvider(): TextProvider {
  return {
    id: "google",
    capabilities: ["reason"],
    transport: "cloud-api",
    enforcesSchema: true, // generateContent responseSchema — see header, 2026-08-27

    async probe(): Promise<ProbeResult> {
      // A KEY-PRESENCE CHECK, and it says so. Proving the key is live would mean
      // spending a turn, and the registry's availability-probe technique is
      // explicit that a probe which cannot prove authorisation must say so
      // rather than pretend. A revoked key shows green here and red on the first
      // real call, where the 401 is classified as `no-key` and the chain walks.
      const name = "GOOGLE_AI_API_KEY";
      const set = Boolean(process.env[name]?.trim());
      return {
        ok: set,
        detail: set
          ? `${name} is set. Whether it is live is not proven by this probe — it is discovered on the first real turn.`
          : `${name} is not set. The cloud text engine is off; set it in .env.local — see .env.example.`,
        why: set ? undefined : "no-key",
        freeToRun: true,
      };
    },

    async reason(req: TextRequest, timeoutMs: number): Promise<TextResult> {
      const started = Date.now();
      const key = keyFor("google");
      const model = MODEL_FOR_TURN[req.turn];

      if (req.prompt.length > MAX_PROMPT_CHARS)
        throw invalidRequest(
          "google",
          `This prompt is ${req.prompt.length} characters, past the ${MAX_PROMPT_CHARS} this adapter ` +
            `will send inline. Nothing was dispatched and nothing was billed.`,
        );

      // The schema decision, made once and reported honestly. See the header:
      // a translated-and-weakened schema reported as `native` would be a claim
      // of enforcement that did not happen.
      const native = req.schema ? toResponseSchema(req.schema) : null;
      const enforcement: SchemaEnforcement = !req.schema ? "none" : native ? "native" : "prompted";
      const prompt =
        req.schema && !native ? `${req.prompt}\n${schemaInstruction(req.schema)}` : req.prompt;

      const body: Record<string, unknown> = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          ...(native ? { responseMimeType: "application/json", responseSchema: native } : {}),
        },
        // NO TOOL DECLARATIONS, ever. This matches what the local engine is
        // given (`--allowed-tools ""`), and lib/claudeCli.ts's header says why
        // in full: these are pure reasoning calls over JSON handed to them, and
        // an engine that could search the web could quietly source a figure the
        // notebook does not contain — the one thing RECALIBRATE-PROMPT.md
        // forbids absolutely. Take the tools away rather than asking it not to
        // use them. The two engines must be equally unable, or the answer
        // depends on which rung served.
      };

      const res = await postJson<GenerateContentResponse>(
        "google",
        `${BASE}/models/${encodeURIComponent(model)}:generateContent`,
        {
          // By HEADER, never a query param, so no URL this adapter builds
          // carries the credential — the same rule lib/imaging/log.ts audited
          // for the image adapters.
          headers: { "x-goog-api-key": key },
          body,
          timeoutMs,
        },
      );

      // A SAFETY BLOCK ARRIVES AS A 200. It is not an HTTP failure and http.ts
      // deliberately does not classify it — there is no shared shape across
      // vendors to hook. Raised here as `refused`, which is reroutable: a
      // refusal is deterministic and only another engine's policy can clear it.
      const blocked = res.promptFeedback?.blockReason;
      const finish = res.candidates?.[0]?.finishReason;
      if (blocked || finish === "SAFETY" || finish === "PROHIBITED_CONTENT") {
        const err = new TextError(
          `Google declined this prompt on safety grounds (${blocked ?? finish}).`,
          "refused",
          "google",
        );
        err.dispatched = true;
        throw err;
      }

      const text = (res.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim();

      if (!text) {
        // An empty answer with a green status is the failure mode the registry
        // calls out by name: it must be a failure, never an empty success.
        const err = new TextError(
          `Google answered with no text (finishReason=${finish ?? "none"}).`,
          "bad-response",
          "google",
          JSON.stringify(res).slice(0, 600),
        );
        err.dispatched = true;
        throw err;
      }

      // Thinking tokens are billed as output and are 13–25× the visible answer
      // on this roster (see the field's comment). Summed here rather than in
      // pricing.ts because the split is a property of THIS vendor's envelope,
      // and pricing.ts must stay free of vendor shapes.
      const usage = res.usageMetadata;
      const outputTokens =
        usage?.candidatesTokenCount === undefined && usage?.thoughtsTokenCount === undefined
          ? undefined
          : (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);

      const quote = priceTurn({
        provider: "google",
        model,
        inputTokens: usage?.promptTokenCount,
        outputTokens,
      });

      return {
        text,
        provenance: {
          provider: "google",
          model,
          transport: "cloud-api",
          rung: "preferred", // the router overwrites this with the real one
          turn: req.turn,
          schemaEnforcement: enforcement,
          durationMs: Date.now() - started,
          costUsd: quote.usd,
          costBasis: quote.basis,
          promptChars: prompt.length,
          inputTokens: usage?.promptTokenCount,
          outputTokens,
        },
      };
    },
  };
}
