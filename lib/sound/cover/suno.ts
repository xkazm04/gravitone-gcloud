import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { CoverSunoFiled, SunoCoverTakeN } from "@gt/domain/cover.suno";
import { AppError, err, errorMessage, isAppError, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Store } from "@gt/kernel/store";

import { AUDIO_EXT, audioExtOf, downloadUntilReady, noFile, paidUrl, pulledName, urlOf, type DownloadDeps } from "../suno/pull.ts";
import { probeDurationS } from "./cut.ts";
import { mutateCover, readCover, writeCoverFile } from "./store.ts";

// KEEP ONE SUNO TAKE (spark suno-covers): the take of a send, bought back from Suno and filed as the cover's remix,
// carrying the Suno clip id it came from. Two presses, on lib/sound/suno/pull.ts's rules and its receipt scope:
//
//   UNCONFIRMED  Suno's own quote for the file: `requires_credit` comes back as a SunoDownloadQuote (one credit, how many
//                the person holds) and nothing is filed. An answer that already carries a `url` needs no credit and is
//                filed free (a song this account already paid for, measured 2026-11-10).
//   CONFIRMED    under GRAVITONE_DRY_ONLY=1 refused before Suno is asked; otherwise a receipt (scope `suno-download`,
//                keyed by song and format) is claimed, the confirmed download spends ONE download credit, and a refusal
//                releases the receipt and is the answer in Suno's words. A press within the receipt's window replays
//                the URL already paid for instead of buying it twice (lib/sound/suno/pull.ts paidUrl).
//
// The bytes are measured (ffprobe) before anything is filed, as the remix route measures an upload: a file that does not
// decode is refused in ffprobe's words and nothing is written. The cover must be `picked`, the take `complete`.

export type FileSunoInput = { readonly id: string; readonly send: number; readonly take: SunoCoverTakeN; readonly confirm?: boolean };

export type FileSunoDeps = Pick<DownloadDeps, "api" | "store" | "actor" | "dryOnly" | "sleep" | "now"> & {
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  /** ffprobe's duration of the bytes, or its refusal naming the file. */
  readonly measure: (bytes: Uint8Array, name: string, ext: string) => Promise<Result<number>>;
};

const FORMAT = "mp3" as const;

/** ffprobe's duration of bytes about to be filed: written to a temp file with the name's own extension, so a decoder that
 *  sniffs by name reads it as what it is. */
export async function probedBytes(bytes: Uint8Array, name: string, ext: string): Promise<Result<number>> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-cover-suno-"));
  try {
    const tmp = path.join(dir, `keep${ext}`);
    await writeFile(tmp, bytes);
    const d = await probeDurationS(tmp);
    return d.ok ? ok(d.value) : err(d.error.code, `${name} could not be read: ${d.error.message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const refuse = (message: string): never => {
  throw new AppError("refused", message);
};

export async function fileSunoTake(input: FileSunoInput, d: FileSunoDeps): Promise<Result<CoverSunoFiled>> {
  const c = await readCover(input.id);
  if (c === undefined) return err("not-found", `no cover ${input.id}`);
  if (c.state !== "picked") return err("refused", `cover ${c.id} is ${c.state}; keeping a Suno take follows a picked winner`);
  const send = c.suno?.sends.find((s) => s.n === input.send);
  if (send === undefined) return err("not-found", `cover ${c.id} has no send ${input.send} to Suno`);
  const take = send.takes.find((t) => t.take === input.take);
  if (take === undefined || take.state !== "complete" || take.clipId === undefined) return err("refused", `take ${input.take} of send ${input.send} was not made; there is nothing to keep`);
  const clipId = take.clipId;
  const title = take.title ?? clipId;
  const filed = { send: send.n, take: take.take, clipId };
  // The same take pressed again: it is the remix already.
  if (c.suno?.filed?.clipId === clipId && c.remix?.sunoClipId === clipId) return ok({ filed });

  let url: string;
  if (input.confirm === true) {
    const paid = await paidUrl(clipId, FORMAT, title, d);
    if (!paid.ok) return paid;
    url = paid.value;
  } else {
    const q = await downloadUntilReady(clipId, FORMAT, false, d);
    if (!q.ok) return q;
    const free = urlOf(q.value);
    if (free === null) {
      if (q.value.status !== "requires_credit") return noFile(q.value, title);
      const left = q.value.credits_remaining ?? undefined;
      return ok({ quote: { clipId, credits: 1, format: FORMAT, ...(left !== undefined ? { left } : {}) } });
    }
    url = free;
  }

  let bytes: Uint8Array;
  try {
    bytes = await d.fetchBytes(url);
  } catch (e) {
    return err("unavailable", errorMessage(e), { detail: "suno-download" });
  }
  const ext = audioExtOf(url, `.${FORMAT}`);
  const name = pulledName(take.title, clipId, ext);
  const measured = await d.measure(bytes, name, ext);
  if (!measured.ok) return measured;
  const file = `remix${ext}`;
  await writeCoverFile(c.id, file, bytes);
  try {
    await mutateCover(c.id, (r) => {
      if (r.state !== "picked") refuse(`cover ${c.id} is ${r.state}; keeping a Suno take follows a picked winner`);
      return { ...r, remix: { file, mime: AUDIO_EXT[ext] ?? "audio/mpeg", name, style: send.plan.style, sunoClipId: clipId }, suno: { ...r.suno, sends: r.suno?.sends ?? [], filed } };
    });
  } catch (e) {
    if (isAppError(e)) return err(e.code, e.message);
    throw e;
  }
  return ok({ filed });
}

/** The process's own dependencies. Imported here, not at the top: the kernel store is server-only and the API client
 *  reads the token file - no test that hands its own dependencies should load them. */
export async function fileSunoDeps(actor: Actor, dryOnly: boolean): Promise<FileSunoDeps> {
  const [{ sunoApi }, { fetchClipBytes }, { kernel }] = await Promise.all([import("../../suno/api/client.ts"), import("../mv/fetchAudio.ts"), import("../../kernelProcess.ts")]);
  return {
    api: sunoApi(),
    fetchBytes: fetchClipBytes,
    measure: probedBytes,
    store: (): Result<Store> => {
      const k = kernel();
      return k.ok ? ok(k.value.store) : k;
    },
    actor,
    dryOnly,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  };
}
