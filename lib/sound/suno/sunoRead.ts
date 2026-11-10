// SUNO'S OWN READ OF A PULLED TAKE (spark suno-api): the three free reads Suno's official API gives
// of a song it made - `analysis` (tempo, key, meter, beats, A/B/C sections, terms, labels), the lyric
// `alignment` (here only its word count) and a `listen` answer to one question - folded into a
// SunoRead and kept on the take (./facts.ts saveSunoRead). The LISTENER DOCTRINE keeps it beside the
// local measurement and the priced Gemini listen, never in place of either: the take surface compares
// the three (@gt/ui suno/reads.ts).
//
// THE WAIT. A new song's analysis can be `processing` for up to a minute and a listen answers in
// 10-40 s (measured 2026-11-10), so analysis and listen are polled every POLL_MS up to CAP_MS, side by
// side; alignment is read once. A part still out at the cap is saved as `processing` (with the
// listen's id), so the person's second press picks the same question back up instead of asking a new
// one - listen is capped at five in flight and 200 a day. Nothing here spends: no receipt. A refusal
// (a 429 on the listen cap, a 403, a 401 with no grant) is the press's answer in Suno's own words, and
// nothing is saved over the read the take already holds.
import type { StudioTakeFacts, SunoRead, SunoReadStatus } from "@gt/domain/audio.suno";
import { SUNO_ANSWER_MAX, sunoAnswerFields } from "@gt/domain/audio.suno.schema";
import { err, ok, type Result } from "@gt/domain/errors";

import type { SunoApi } from "../../suno/api/client.ts";
import type { Alignment, Analysis, Listen } from "../../suno/api/wire.ts";

export const POLL_MS = 3_000;
export const CAP_MS = 45_000;

/** The one question every listen asks: prose, then a json block the read parses (@gt/domain sunoAnswerFields). */
export const SUNO_LISTEN_QUESTION =
  'Describe this song in two or three sentences. Then end with one ```json block holding: "genre" (a list), "mood" (a list), "bpm" (a number), "key" (like "B minor"), "vocals" ({"heard": true or false, "character": a few words}) and "sections" (a list of {"name", "start_s"}).';

export type SunoReadApi = Pick<SunoApi, "analysis" | "alignment" | "listen" | "listenRead">;

export type SunoReadDeps = {
  readonly api: SunoReadApi;
  readonly facts: (takeId: string) => Promise<Result<StudioTakeFacts>>;
  readonly save: (takeId: string, read: SunoRead) => Promise<Result<StudioTakeFacts>>;
  readonly now: () => Date;
  readonly sleep: (ms: number) => Promise<void>;
  readonly pollMs?: number;
  readonly capMs?: number;
};

/** A vendor status as the read's three: done, still out, or not coming. */
export function phaseOf(status: string): SunoReadStatus {
  const s = status.toLowerCase();
  if (s === "complete" || s === "completed" || s === "succeeded") return "complete";
  if (s === "failed" || s === "error" || s === "unavailable" || s === "cancelled") return "unavailable";
  return "processing";
}

/** Ask, then ask again every pollMs while the answer is still out, until the cap. */
async function polled<T extends { readonly status: string }>(first: () => Promise<Result<T>>, again: () => Promise<Result<T>>, d: SunoReadDeps): Promise<Result<T>> {
  const pollMs = d.pollMs ?? POLL_MS;
  const capMs = d.capMs ?? CAP_MS;
  const start = d.now().getTime();
  let r = await first();
  while (r.ok && phaseOf(r.value.status) === "processing" && d.now().getTime() - start + pollMs <= capMs) {
    await d.sleep(pollMs);
    r = await again();
  }
  return r;
}

type ListenPart = { readonly kind: "kept" } | { readonly kind: "read"; readonly value: Listen };

/** The listen: the answer the take already holds, the question it left open, or a new one. */
async function listenPart(clipId: string, prior: SunoRead | undefined, d: SunoReadDeps): Promise<Result<ListenPart>> {
  if (prior?.answer !== undefined) return ok({ kind: "kept" });
  const open = prior?.listenId;
  let id = open;
  const r = await polled(
    async () => {
      if (open !== undefined) return d.api.listenRead(open);
      const asked = await d.api.listen(clipId, SUNO_LISTEN_QUESTION);
      if (asked.ok) id = asked.value.id;
      return asked;
    },
    () => d.api.listenRead(id ?? ""),
    d,
  );
  return r.ok ? ok({ kind: "read", value: { ...r.value, id: id ?? r.value.id } }) : r;
}

/** The read's sections, each with a label (Suno's A/B/C, or `section n` when it gave none). */
const sectionsOf = (a: Analysis): SunoRead["sections"] =>
  (a.sections ?? []).slice(0, 64).map((x, i) => ({ label: (x.label ?? "").trim().slice(0, 40) || `section ${i + 1}`, startS: Math.max(0, x.start_s), endS: Math.max(0, x.end_s) }));

const labelsOf = (a: Analysis): SunoRead["labels"] =>
  (a.labels ?? [])
    .filter((l) => l.label.trim() !== "" && typeof l.probability === "number")
    .slice(0, 32)
    .map((l) => ({ label: l.label.trim().slice(0, 80), p: Math.min(1, Math.max(0, l.probability ?? 0)) }));

const termsOf = (a: Analysis): readonly string[] => [...new Set((a.terms ?? []).map((t) => t.trim().slice(0, 60)).filter((t) => t !== ""))].slice(0, 32);

/** Fold the three parts into one read: still out wins (a second press finishes it), then any part that answered. */
export function foldRead(at: string, analysis: Analysis, listen: ListenPart, alignment: Alignment, prior: SunoRead | undefined): SunoRead {
  const ap = phaseOf(analysis.status);
  const done = ap === "complete" ? analysis : null;
  const answered = listen.kind === "read" && phaseOf(listen.value.status) === "complete" && (listen.value.answer ?? "").trim() !== "";
  const lp: SunoReadStatus = listen.kind === "kept" || answered ? "complete" : listen.kind === "read" ? phaseOf(listen.value.status) : "unavailable";
  const answer = listen.kind === "kept" ? prior?.answer : answered ? (listen.value.answer ?? "").trim().slice(0, SUNO_ANSWER_MAX) : undefined;
  const fields = answer === undefined ? {} : sunoAnswerFields(answer);
  const status: SunoReadStatus = ap === "processing" || lp === "processing" ? "processing" : ap === "complete" || lp === "complete" ? "complete" : "unavailable";
  const bpm = done?.bpm ?? fields.bpm;
  const key = done?.key ?? fields.key;
  const meter = done?.time_signature;
  return {
    at,
    status,
    ...(typeof bpm === "number" && bpm >= 20 && bpm <= 400 ? { bpm } : {}),
    ...(typeof key === "string" && key.trim() !== "" ? { key: key.trim().slice(0, 40) } : {}),
    ...(typeof meter === "number" && Number.isInteger(meter) && meter >= 1 && meter <= 16 ? { timeSignature: meter } : {}),
    sections: done === null ? [] : sectionsOf(done),
    terms: done === null ? [] : termsOf(done),
    labels: done === null ? [] : labelsOf(done),
    ...(answer !== undefined && answer !== "" ? { answer } : {}),
    ...(fields.genre !== undefined ? { genre: fields.genre } : {}),
    ...(fields.mood !== undefined ? { mood: fields.mood } : {}),
    ...(fields.vocals !== undefined ? { vocals: fields.vocals } : {}),
    ...(phaseOf(alignment.status) === "complete" ? { words: (alignment.words ?? []).length } : {}),
    ...(lp === "processing" && listen.kind === "read" ? { listenId: listen.value.id } : {}),
  };
}

/** Read the pulled take through Suno's three free reads and keep the read; a refusal saves nothing. */
export async function readSunoTake(takeId: string, d: SunoReadDeps): Promise<Result<StudioTakeFacts>> {
  const facts = await d.facts(takeId);
  if (!facts.ok) return facts;
  const clipId = facts.value.sunoClipId;
  if (clipId === undefined) return err("invalid", `take ${takeId} was not pulled from suno, so suno has no read of it`);
  const prior = facts.value.suno;
  const [analysis, listen, alignment] = await Promise.all([
    polled(() => d.api.analysis(clipId), () => d.api.analysis(clipId), d),
    listenPart(clipId, prior, d),
    d.api.alignment(clipId),
  ]);
  if (!analysis.ok) return analysis;
  if (!listen.ok) return listen;
  if (!alignment.ok) return alignment;
  return d.save(takeId, foldRead(d.now().toISOString(), analysis.value, listen.value, alignment.value, prior));
}

/** The process's own dependencies: the API client, the facts store, the wall clock. */
export async function sunoReadDeps(): Promise<SunoReadDeps> {
  const [{ sunoApi }, { factsOf, saveSunoRead }] = await Promise.all([import("../../suno/api/client.ts"), import("./facts.ts")]);
  return { api: sunoApi(), facts: factsOf, save: saveSunoRead, now: () => new Date(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
}
