// THE LISTENER (spark suno-advisor): one priced read of an uploaded take by an audio-capable model,
// returned as a StudioListen and kept on the take (./facts.ts saveListened). Quoted before it runs;
// DRY by default (GRAVITONE_DRY_ONLY=1 forces a stand-in marked as one). Its read is a hypothesis:
// audio models over-specify instruments and misread vocal presence, so the page shows it unconfirmed.
//
// THE ORDER, and each step refuses in words rather than walking on:
//   1. the take's facts (its measured length) - no facts, no listen;
//   2. the QUOTE (./listenPrompt.ts listenQuote over the kernel price table) - an unpriced listen is
//      refused naming the missing rate, dry or live: a press that cannot say its price is not offered;
//   3. the file - an audio file this server holds, small enough for the vendor's inline request
//      (providers/google.ts GOOGLE_INLINE_REQUEST_MAX_BYTES), refused before any receipt otherwise;
//   4. the RECEIPT (@gt/kernel/pricing/receipts), scope `suno-listen`, keyed by take: a double press
//      within the receipt's window replays the first read instead of buying a second, a press while
//      one is in flight is a conflict, and dry and live are separate claims;
//   5. the read - the stand-in under GRAVITONE_DRY_ONLY=1 (no vendor is called), else ONE turn through
//      the text router (`suno-listen`, the audio inline). A refusal from the router, or an answer the
//      door refuses, RELEASES the claim and is the press's answer: never retried silently - a second
//      try is the person's next press, and the vendor may have billed the first;
//   6. settle the receipt (the vendor's counts priced, else the quote), keep the read on the take.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { StudioListen, StudioTakeFacts } from "@gt/domain/audio.suno";
import { studioListenSchema } from "@gt/domain/audio.suno.schema";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { claimReceipt, releaseReceipt, settleReceipt, type ReceiptKey, type ReceiptMode } from "@gt/kernel/pricing/receipts";
import type { Quote } from "@gt/kernel/pricing/quote";
import type { Store } from "@gt/kernel/store";

import { GOOGLE_INLINE_REQUEST_MAX_BYTES, inlineAudioBytes } from "@/lib/text/providers/google";
import type { TextRequest, TextResult } from "@/lib/text/types";

import { LISTEN_MODEL, LISTEN_SCHEMA, listenPrompt, listenQuote, promptText, readOf, settledQuote, standInRead, SUNO_LISTEN_TURN } from "./listenPrompt";

export type ReasonFn = (req: TextRequest) => Promise<TextResult>;

/** The receipt scope every listen claims under. */
export const LISTEN_SCOPE = "suno-listen";

/** The take's bytes as the vendor will hear them. */
export type TakeAudio = { readonly bytes: Uint8Array; readonly mimeType: string };

/** Everything a listen reaches outside itself, so a test can stand each one in. */
export type ListenDeps = {
  readonly store: () => Result<Store>;
  readonly facts: (takeId: string) => Promise<Result<StudioTakeFacts>>;
  readonly audio: (takeId: string) => Promise<Result<TakeAudio>>;
  readonly save: (takeId: string, listen: StudioListen) => Promise<Result<StudioTakeFacts>>;
  readonly reason: ReasonFn;
  readonly prompt: () => Promise<Result<string>>;
  readonly quote: (durationS: number, on: string) => Quote;
  readonly dryOnly: boolean;
  readonly now: () => Date;
  readonly actor: Actor;
};

const usd = (n: number): string => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/** The price of one listen of a take this long, in USD; undefined when the pricing table cannot say (Listen then refuses). */
export function quoteListen(durationS: number): number | undefined {
  const q = listenQuote(durationS, new Date().toISOString());
  return q.usd === null ? undefined : q.usd;
}

/** The mime the vendor is told, from the take's stored mime (lib/sound/takes.ts audioMime). */
function vendorMime(mime: string): string | undefined {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (m === "audio/mpeg" || m === "audio/mp3") return "audio/mp3";
  if (m === "audio/wav" || m === "audio/x-wav" || m === "audio/wave") return "audio/wav";
  if (m.startsWith("audio/")) return m;
  return undefined;
}

/** The take's file, read from the sound store (the record WP1's upload route creates). */
async function takeAudio(takeId: string): Promise<Result<TakeAudio>> {
  try {
    const [{ getTake }, { filePathAbs }] = await Promise.all([import("../takes"), import("../store")]);
    const take = await getTake(takeId);
    if (take.file === null) return err("not-found", `take ${takeId} has no audio file to listen to`);
    const mimeType = vendorMime(take.file.mime);
    if (mimeType === undefined) return err("invalid", `take ${takeId} is ${take.file.mime}, not audio; nothing to listen to`);
    return ok({ bytes: new Uint8Array(await readFile(filePathAbs(take.file.path))), mimeType });
  } catch (e) {
    return err("not-found", `take ${takeId}: its audio could not be read: ${errorMessage(e)}`);
  }
}

/** A stable name for one request: the take's bytes, the model and the prompt as sent. */
function bodyHash(takeId: string, audio: TakeAudio, prompt: string): string {
  const h = createHash("sha256");
  for (const part of [takeId, LISTEN_MODEL, audio.mimeType, prompt]) h.update(part).update("\u0000");
  h.update(audio.bytes);
  return h.digest("hex");
}

/** Listen with every dependency named: the testable core of `listenTake`. */
export async function listenWith(takeId: string, d: ListenDeps): Promise<Result<StudioTakeFacts>> {
  const facts = await d.facts(takeId);
  if (!facts.ok) return facts;
  const durationS = facts.value.durationS;
  const day = d.now().toISOString();

  const q = d.quote(durationS, day);
  if (q.usd === null) return err("refused", `listen is unpriced, so it is not run: ${q.note}`);
  const priced = `${usd(q.usd)} quoted for ${Math.round(durationS)} s on ${LISTEN_MODEL}`;

  const audio = await d.audio(takeId);
  if (!audio.ok) return audio;
  const tmpl = await d.prompt();
  if (!tmpl.ok) return tmpl;
  const prompt = listenPrompt(tmpl.value, durationS);
  const body = inlineAudioBytes(audio.value.bytes.byteLength) + Buffer.byteLength(prompt, "utf8");
  if (body > GOOGLE_INLINE_REQUEST_MAX_BYTES) {
    return err("refused", `take ${takeId} is ${(audio.value.bytes.byteLength / 1e6).toFixed(1)} MB; inline it would be ${(body / 1e6).toFixed(1)} MB, past the ${GOOGLE_INLINE_REQUEST_MAX_BYTES / 1e6} MB Google takes in one request. Nothing was sent (${priced}).`);
  }

  const store = d.store();
  if (!store.ok) return store;
  const mode: ReceiptMode = d.dryOnly ? "dry" : "live";
  const key: ReceiptKey = { scope: LISTEN_SCOPE, key: takeId, mode };
  const hash = bodyHash(takeId, audio.value, prompt);
  const claim = store.value.tx((t) => claimReceipt(t, key, hash, studioListenSchema, d.actor));
  if (!claim.ok) return err(claim.error.code, `listen ${takeId}: ${claim.error.message}`);
  if (claim.value.kind === "replay") return d.save(takeId, claim.value.value as StudioListen);

  // The refusal is the press's answer; a release that fails leaves a pending claim, which recovery
  // names as interrupted and never re-runs (receipts.ts) - so its own failure is not raised over it.
  const release = (why: string): void => void store.value.tx((t) => releaseReceipt(t, key, d.actor, why));

  let read: StudioListen;
  let settle: Quote = q;
  if (d.dryOnly) {
    // GRAVITONE_DRY_ONLY=1: no vendor is called. The stand-in says what it is.
    read = standInRead(day);
  } else {
    let served: TextResult;
    try {
      served = await d.reason({ turn: SUNO_LISTEN_TURN, prompt, schema: LISTEN_SCHEMA, audio: { mimeType: audio.value.mimeType, bytes: audio.value.bytes } });
    } catch (e) {
      const why = errorMessage(e);
      release(`the listener refused: ${why}`);
      return err("refused", `listen ${takeId}: ${why}`);
    }
    const r = readOf(served.json, { model: served.provenance.model, at: day, durationS });
    if (!r.ok) {
      release(`the listener's answer was refused at the door: ${r.error.message}`);
      return err("invalid", `${r.error.message} (the read was not kept; the vendor may have billed it)`);
    }
    read = r.value;
    settle = settledQuote(durationS, served.provenance.inputTokens, served.provenance.outputTokens, day, q);
    if (settle.usd === null) settle = q;
  }

  const settled = store.value.tx((t) => settleReceipt(t, key, read, settle, d.actor));
  if (!settled.ok) return err("internal", `listen ${takeId}: the read arrived but its receipt could not be settled: ${settled.error.message}`);
  return d.save(takeId, read);
}

/** The process's own dependencies. */
export async function listenDeps(actor: Actor = { kind: "operator", id: "operator" }): Promise<ListenDeps> {
  // Imported here, not at the top: the kernel store module is server-only, the router pulls the
  // vendor adapters, and ./facts.ts imports this file for `quoteListen` (a static import back would
  // be a cycle) - none of them belongs in a test that imports this file with its own dependencies.
  const [{ kernel }, { reason }, { factsOf, saveListened }] = await Promise.all([import("@/lib/kernelStore"), import("@/lib/text/router"), import("./facts")]);
  return {
    store: () => {
      const k = kernel();
      return k.ok ? ok(k.value.store) : k;
    },
    facts: factsOf,
    audio: takeAudio,
    save: saveListened,
    reason,
    prompt: () => promptText(),
    quote: (s, on) => listenQuote(s, on),
    dryOnly: process.env.GRAVITONE_DRY_ONLY === "1",
    now: () => new Date(),
    actor,
  };
}

/** Listen to one take: quote, receipt, call (or stand-in under DRY), validate, keep. */
export async function listenTake(takeId: string): Promise<Result<StudioTakeFacts>> {
  return listenWith(takeId, await listenDeps());
}
