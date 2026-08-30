// GOOGLE — the production vendor, and the dev-environment editor.
//
// Two models, one endpoint:
//   gemini-3.1-flash-image  ("Nano Banana 2")  generate + edit
//   gemini-3.6-flash                           recognize
//
// WIRE FORMAT WARNING, and the reason this file is written the way it is:
// Google replaced `generateContent` with the **Interactions API**. The old
// shape (`contents[].parts[]`, `generationConfig`, `responseMimeType`,
// `responseSchema`) is legacy; the legacy Interactions response schema
// (`outputs[]`) was removed outright in June 2026 and the wire format is now
// `steps[]`. Anything written from memory of the old API is wrong in SHAPE,
// not merely in model id — so do not "correct" this file toward the older
// pattern you may recognise.
//
// Raw fetch rather than @google/genai on purpose: the repo has four runtime
// dependencies and this needs none of what the SDK adds. It also keeps the key
// server-side by construction — @google/genai has no browser guard at all,
// only a README warning.

import { ImagingError } from "../errors";
import { keyFor } from "../env";
import { requestJson } from "../http";
import { parseAgainstSchema } from "../json";
import { priceCall } from "../pricing";
import type {
  EditRequest,
  GenerateRequest,
  GeneratedImages,
  ImageRef,
  ImagingProvider,
  RecognizeRequest,
  Recognition,
} from "../types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * Nano Banana 2 — the full model, deliberately NOT the Lite variant.
 *
 * Lite is cheaper and would do for one-off plates, but it supports only OBJECT
 * reference images: no style references, no character consistency. /library's
 * whole premise is that approved plates condition every later frame, so Lite
 * cannot hold the product's central promise. `gemini-3.1-flash-lite-image`
 * remains a valid value for GOOGLE_IMAGE_MODEL if a caller ever wants the
 * cheaper path for something style-lock does not touch.
 */
const IMAGE_MODEL = process.env.GOOGLE_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";
const VISION_MODEL = process.env.GOOGLE_VISION_MODEL?.trim() || "gemini-3.6-flash";

/** 0.5K · 1K · 2K · 4K — an NB2 capability; Lite is 1K-only. 1K by default
 *  because plates are iterated on, and the price roughly doubles per step. */
const IMAGE_SIZE = process.env.GOOGLE_IMAGE_SIZE?.trim() || "1K";

/**
 * JPEG, and not by choice: the API rejects anything else outright —
 * "The value 'image/png' is not supported for 'response_format.mime_type'.
 * Supported values: 'image/jpeg'." (measured, 2026-08-13).
 *
 * Lossy compression on flat colour fields is the one thing that would worry me
 * here, since ringing shows up hardest on exactly the hard edges this style is
 * made of. It is acceptable because of the layer split: the plate carries
 * colour and shape, while every crisp element — captions, numbers, rules,
 * arrows — is vector drawn on top by us. If plates ever have to carry fine
 * detail alone, this constraint is the first thing to re-examine.
 */
const IMAGE_MIME = "image/jpeg";

/* ── The Interactions wire shape ──────────────────────────────────────────── */

type InputPart =
  | { type: "text"; text: string }
  | { type: "image"; mime_type: string; data: string };

interface Interaction {
  status?: "completed" | "in_progress" | "requires_action" | "failed";
  steps?: { type?: string; content?: { type?: string; text?: string; mime_type?: string; data?: string }[] }[];
  output_text?: string;
  output_image?: { data?: string; mime_type?: string };
  usage?: Record<string, unknown>;
  error?: { message?: string; reason?: string };
}

const imagePart = (img: ImageRef): InputPart => ({
  type: "image",
  mime_type: img.mime,
  data: img.base64,
});

/** Every image the interaction produced, from either accessor. The convenience
 *  field is not guaranteed, so `steps[]` is the source of truth and
 *  `output_image` only a fast path. */
function imagesFrom(res: Interaction): { data: string; mime: string }[] {
  const out: { data: string; mime: string }[] = [];
  for (const step of res.steps ?? [])
    for (const c of step.content ?? [])
      if (c.type === "image" && c.data) out.push({ data: c.data, mime: c.mime_type || "image/png" });

  if (!out.length && res.output_image?.data)
    out.push({ data: res.output_image.data, mime: res.output_image.mime_type || "image/png" });
  return out;
}

function textFrom(res: Interaction): string {
  if (res.output_text) return res.output_text;
  const parts: string[] = [];
  for (const step of res.steps ?? [])
    for (const c of step.content ?? []) if (c.type === "text" && c.text) parts.push(c.text);
  return parts.join("\n").trim();
}

/**
 * Turn a non-answer into the right error kind.
 *
 * The safety-block shape for the Interactions API is UNDOCUMENTED — Google's
 * published block fields (`promptFeedback.blockReason`, `finishReason: SAFETY`)
 * all describe the legacy endpoint. So this reads `status` first and sniffs the
 * error text second, and there is a known class of bug where a block arrives as
 * a silently empty result. An empty result is therefore treated as a refusal
 * rather than a success, which is the safe direction: a refusal re-routes to
 * another vendor, where a false success would hand the caller nothing.
 */
function assertUsable(res: Interaction, what: string): void {
  const blocked = /safety|blocked|prohibited|policy|violat/i;
  if (res.status === "failed") {
    const msg = res.error?.message || res.error?.reason || "";
    throw new ImagingError(
      blocked.test(msg)
        ? `Google declined this ${what} on safety grounds.`
        : `Google could not complete this ${what}. ${msg}`.trim(),
      blocked.test(msg) ? "refused" : "failed",
      "google",
      res.error,
    );
  }
  if (res.status === "in_progress" || res.status === "requires_action")
    throw new ImagingError(
      `Google returned an unfinished interaction (${res.status}).`,
      "bad-response",
      "google",
      res.status,
    );
}

/* ── The provider ─────────────────────────────────────────────────────────── */

export function googleProvider(): ImagingProvider {
  return {
    id: "google",
    capabilities: ["generate", "edit", "recognize"],
    // Nano Banana 2 (not Lite) conditions on style references — the reason
    // this project is on the full model.
    supportsReferences: true,

    async generate(req: GenerateRequest): Promise<GeneratedImages> {
      const refs = (req.references ?? []).slice(0, 14);
      const input: InputPart[] = [
        { type: "text", text: buildPrompt(req.prompt, req.negativePrompt, refs.length) },
      ];
      // Reference plates go in as image parts after the instruction — and the
      // instruction has already said what they are FOR. An unlabelled reference
      // is read as content to reproduce, which on a style-lock request means
      // getting the previous frame's subject back in the new frame's style:
      // exactly backwards.
      for (const r of refs) input.push(imagePart(r));

      return runImage(
        {
          model: IMAGE_MODEL,
          input,
          response_format: {
            type: "image",
            mime_type: IMAGE_MIME,
            aspect_ratio: req.aspect,
            image_size: IMAGE_SIZE,
          },
        },
        req.count ?? 1,
        "generation",
        req.seed,
        // The size we ACTUALLY asked for, handed to the price table rather than
        // assumed by it: the measured figure is a 1K figure, and a 2K render
        // quoted at the 1K rate would be a fiction, not a rounding error.
        IMAGE_SIZE,
      );
    },

    async edit(req: EditRequest): Promise<GeneratedImages> {
      // Editing is the SAME endpoint with an image in the input — there is no
      // separate edit route. The instruction leads, the subject follows.
      //
      // THE ROLE MAP IS NOT OPTIONAL HERE, and this path went without one while
      // `generate` twelve lines up has carried it since it was written. That
      // asymmetry is backwards: generate attaches ONE kind of image, and edit
      // attaches two — the plate being edited and the style references — so it
      // is the heterogeneous call, the exact case reference-role-map exists for.
      // Unlabelled, the attachments are ambiguous about EACH OTHER: nothing
      // tells the model which image is the thing to change and which are the
      // look to change it into, and the failure mode is the same one generate's
      // own comment names — a style reference read as content to reproduce.
      const refs = (req.references ?? []).slice(0, 13);
      const input: InputPart[] = [
        { type: "text", text: buildEditPrompt(req.instruction, refs.length) },
        imagePart(req.image),
      ];
      for (const r of refs) input.push(imagePart(r));

      // NO `image_size` here, and therefore NO PRICE — deliberately, on both
      // counts. An edit should come back at the resolution of the plate it was
      // given; pinning 1K to make the call priceable would silently downsample
      // a 2K plate, which is trading the user's pixels for our bookkeeping. So
      // the vendor's default applies, we have not measured what that default
      // costs, and `pricing.ts` reports the edit unpriced with that reason
      // attached. Measure an edit, or pin a size, and it prices itself.
      return runImage(
        { model: IMAGE_MODEL, input, response_format: { type: "image", mime_type: IMAGE_MIME } },
        1,
        "edit",
      );
    },

    async recognize(req: RecognizeRequest): Promise<Recognition> {
      const started = Date.now();
      const key = keyFor("google");

      const res = await requestJson<Interaction>("google", ENDPOINT, {
        method: "POST",
        headers: { "x-goog-api-key": key },
        body: {
          model: VISION_MODEL,
          input: [{ type: "text", text: req.instruction }, imagePart(req.image)],
          // Native schema enforcement. NOTE the shape: responseMimeType and
          // responseSchema no longer exist; this is the current form.
          ...(req.schema
            ? {
                response_format: {
                  type: "text",
                  mime_type: "application/json",
                  schema: req.schema,
                },
              }
            : {}),
        },
        timeoutMs: 120_000,
      });

      assertUsable(res, "recognition");
      const text = textFrom(res);
      if (!text)
        throw new ImagingError("Google returned an empty recognition.", "refused", "google", res.status);

      const vision = priceCall({ provider: "google", model: VISION_MODEL });
      return {
        text,
        json: req.schema ? parseAgainstSchema("google", text, req.schema) : undefined,
        provenance: {
          provider: "google",
          model: VISION_MODEL,
          // Routed through the same table as everything else, and it comes back
          // undefined on purpose: recognition is billed per token, and no
          // USD-per-token rate has been checked. The row in pricing.ts carries
          // that reason, so the day someone checks the rate this line starts
          // reporting without being touched.
          costUsd: vision.usd,
          costBasis: vision.basis,
          durationMs: Date.now() - started,
          cleanup: "not-applicable",
        },
      };
    },
  };
}

/** One image call, repeated when the caller wants several candidates.
 *
 *  The Interactions image response carries a single image, so N candidates are
 *  N calls. They run concurrently — the alternative is N × latency for a
 *  filmstrip the user is waiting on. */
async function runImage(
  body: Record<string, unknown>,
  count: number,
  what: string,
  seed?: number,
  /** The `image_size` this request pins, when it pins one. See pricing.ts. */
  size?: string,
): Promise<GeneratedImages> {
  const started = Date.now();
  const key = keyFor("google");
  const n = Math.min(Math.max(count, 1), 8);

  // THE INTERACTIONS API HAS NO `seed`. Measured 2026-08-27, the first time a
  // caller (lib/foundry/extract) ever passed one: every request answered
  //   400 {"error":{"message":"Unknown parameter 'seed.'","code":"invalid_request"}}
  // in ~100 ms. The parameter used to be spliced in here as `seed + i` on the
  // reasoning that N candidates need N different seeds; the reasoning was
  // sound and the field does not exist. So the request's seed is NOT honoured
  // by this vendor, and that is said here rather than hidden: a caller that
  // needs reproducible pixels from Google does not get them today, and a
  // `seed` on a GenerateRequest is intent recorded for a vendor that can.
  void seed;
  const calls = Array.from({ length: n }, () =>
    requestJson<Interaction>("google", ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": key },
      body,
      timeoutMs: 180_000,
    }),
  );

  const results = await Promise.all(calls);
  const images: ImageRef[] = [];
  for (const res of results) {
    assertUsable(res, what);
    for (const img of imagesFrom(res))
      images.push({ base64: img.data, mime: (img.mime as ImageRef["mime"]) ?? "image/png" });
  }

  if (!images.length)
    throw new ImagingError(
      `Google returned no image for this ${what}. This is how a safety block usually presents.`,
      "refused",
      "google",
      results[0]?.status,
    );

  // Google's Interactions response carries no money field, so the cost comes
  // from the declared table instead of being left undefined. It is an ESTIMATE
  // — priced per image actually returned, at the size we asked for — and
  // pricing.ts is where that claim is sourced and dated.
  const model = String(body.model);
  const price = priceCall({ provider: "google", model, images: images.length, size });

  return {
    images,
    provenance: {
      provider: "google",
      model,
      costUsd: price.usd,
      costBasis: price.basis,
      durationMs: Date.now() - started,
      cleanup: "not-applicable", // nothing is stored server-side to clean up
    },
  };
}

/**
 * Google takes no negative-prompt field, so a negative becomes an explicit
 * exclusion clause rather than being silently dropped — the probe prompt in
 * pipeline/FRAMES-PROMPT.md depends on one.
 *
 * `refCount` adds the clause that makes style-lock work. Attached images are
 * ambiguous by default: the model has no way to know whether it is being shown
 * a subject to redraw or a look to imitate, and it guesses "subject". Saying so
 * explicitly is the difference between locking a style and cloning a frame.
 */
/** The EDIT path's role map. Two roles, because an edit call carries two kinds
 *  of image, and `reference-role-map` is explicit that the map leads: "the half
 *  that resolves ambiguity has to arrive before the ambiguous material does."
 *  So it is prepended to the instruction rather than appended the way
 *  `buildPrompt` appends its single-role note — there the prompt IS the subject
 *  description and the note qualifies it; here the instruction is an operation
 *  on assets the model has not been introduced to yet.
 *
 *  NEGATIVE SCOPE ON BOTH ROLES, per the technique's rule 4 ("the map states
 *  what an asset must NOT influence when the risk is real"): the plate must not
 *  contribute style once references are present, and the references must not
 *  contribute content. Those are the two bleeds this call can actually suffer.
 *
 *  With no references there is one image and no ambiguity, so the instruction
 *  goes through untouched — the same `refCount > 0` guard buildPrompt uses, and
 *  the reason the no-reference edit path is byte-identical to what it was. */
export function buildEditPrompt(instruction: string, refCount = 0): string {
  if (refCount <= 0) return instruction;
  return [
    "IMAGE ROLES — read before the instruction.",
    "· Image 1 is the SUBJECT PLATE: the image being edited. It controls the content, " +
      "composition and identity of the result. Preserve them except where the instruction " +
      "below says otherwise, and do not take its style from anywhere but the references.",
    `· The ${refCount === 1 ? "next attached image is a STYLE REFERENCE" : `next ${refCount} attached images are STYLE REFERENCES`}. ` +
      "They control technique, palette, line weight and finish, and nothing else. " +
      "Do NOT copy their subject matter, composition or any object from them into the result.",
    "",
    instruction,
  ].join("\n");
}

export function buildPrompt(prompt: string, negative?: string, refCount = 0): string {
  const parts = [prompt];
  if (refCount > 0)
    parts.push(
      `The ${refCount === 1 ? "attached image is a STYLE REFERENCE" : `${refCount} attached images are STYLE REFERENCES`}, ` +
        "not content to reproduce. Match their technique, palette, line weight and finish exactly. " +
        "Do NOT copy their subject matter — draw the subject described above, in their visual language.",
    );
  if (negative?.trim()) parts.push(`Do not include any of the following: ${negative.trim()}.`);
  return parts.join("\n\n");
}
