// PULL A TAKE FROM SUNO (spark suno-api): a song in the person's Suno library - one they made on
// suno.com, or a clip a create returned - filed as a studio take that carries its Suno clip id, so
// Suno's own free reads can be asked of it (./sunoRead.ts). Upload stays for files made elsewhere.
//
// THE BYTES ARE SUNO'S OFFICIAL DOWNLOAD, AND IT CAN COST A DOWNLOAD CREDIT. The API refuses to
// stream suno.com songs and the profile's CDN file is encoded (measured 2026-11-10: no MP4 atoms,
// "moov atom not found"); it is not decoded here. `POST /v0/audio/{id}/download` is the door:
//   1. the clip is checked through the API (it must be `complete`);
//   2. UNCONFIRMED, the download is Suno's free quote. `requires_credit` comes back to the person as
//      a SunoDownloadQuote (one credit, how many they hold) and nothing is filed; an answer that
//      already carries a `url` needs no credit and is filed at once;
//   3. CONFIRMED (the person's second press): under GRAVITONE_DRY_ONLY=1 it is refused before Suno
//      is asked; otherwise a RECEIPT (@gt/kernel/pricing/receipts, scope `suno-download`, keyed by
//      song and format) is claimed first - a press while one is in flight is a conflict, and a press
//      within the receipt's window replays the URL already paid for instead of buying it twice -
//      then the confirmed download, waiting out `processing` (at most once a second, ~50 s); the
//      receipt settles with the URL, and a refusal releases it and is the answer in Suno's words;
//   4. the bytes go through the same step an upload does (./measure.ts): measured before filed.
// A song this server already pulled answers the take it already holds, before any of it.
import { z } from "zod";

import type { StudioTakeFacts, SunoDownloadQuote, SunoSong } from "@gt/domain/audio.suno";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { claimReceipt, releaseReceipt, settleReceipt, type ReceiptKey } from "@gt/kernel/pricing/receipts";
import type { Store } from "@gt/kernel/store";

import type { SunoApi } from "../../suno/api/client.ts";
import type { Clip, Download, DownloadFormat } from "../../suno/api/wire.ts";
import type { IncomingFile } from "../takes.ts";
import type { TakeFrom } from "./facts.ts";
import { phaseOf } from "./sunoRead.ts";

export type PullInput = {
  readonly session: string;
  readonly clipId: string;
  readonly promptId?: string;
  readonly clip?: "a" | "b";
  readonly format?: DownloadFormat;
  /** The person's second press: spend the download credit the quote named. */
  readonly confirm?: boolean;
};

export type PullDeps = {
  readonly api: Pick<SunoApi, "getClip" | "download">;
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  readonly measureAndFile: (file: IncomingFile, from: TakeFrom) => Promise<Result<StudioTakeFacts>>;
  /** A take already pulled from this song (null: none). */
  readonly held: (clipId: string) => Promise<Result<StudioTakeFacts | null>>;
  /** Suno's free read, asked once the take is filed (./sunoRead.ts readSunoTake). */
  readonly read: (takeId: string) => Promise<Result<StudioTakeFacts>>;
  readonly store: () => Result<Store>;
  readonly actor: Actor;
  readonly dryOnly: boolean;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
};

/** What the paid download needs of a process: the API's download, the kernel store (the receipt), who pressed. The
 *  cover's keep (../cover/suno.ts) spends through the same receipt and hands only these. */
export type DownloadDeps = Pick<PullDeps, "store" | "actor" | "dryOnly" | "sleep" | "now"> & { readonly api: Pick<SunoApi, "download"> };

/** The pulled take (and the read's refusal in Suno's words when the read did not go; the take is
 *  filed either way), or Suno's price for the file when it needs a download credit. */
export type Pulled = { readonly facts: StudioTakeFacts; readonly readRefused?: string } | { readonly quote: SunoDownloadQuote };

/** The receipt scope every confirmed download claims under. */
export const DOWNLOAD_SCOPE = "suno-download";
/** Suno: call again while `processing`, no more than once a second. */
export const DOWNLOAD_POLL_MS = 1_100;
/** How long one press waits out `processing` (Suno's own tool waits about 50 s). */
export const DOWNLOAD_WAIT_MS = 50_000;

const paidSchema = z.object({ url: z.string().min(1), format: z.enum(["mp3", "wav"]), left: z.number().optional() });

/** The audio's own container, read off its URL. */
export const AUDIO_EXT: Readonly<Record<string, string>> = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg", ".flac": "audio/flac", ".aac": "audio/aac", ".webm": "audio/webm" };

/** The URL's audio extension; `fallback` (the format asked for) when it names none. */
export function audioExtOf(url: string, fallback = ".mp3"): string {
  let p = url;
  try {
    p = new URL(url).pathname;
  } catch {
    // not a URL: read the string as a path
  }
  const ext = (/\.[a-z0-9]{2,5}$/i.exec(p)?.[0] ?? "").toLowerCase();
  return ext in AUDIO_EXT ? ext : fallback;
}

/** A file name from the song's title: what a person would have saved it as. */
export function pulledName(title: string | null | undefined, clipId: string, ext = ".mp3"): string {
  const t = (title ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return `${t === "" ? clipId : t}${ext}`;
}

export const urlOf = (r: Download): string | null => (typeof r.url === "string" && r.url !== "" ? r.url : null);

/** Ask the download until it carries a URL or says something other than `processing`. */
export async function downloadUntilReady(id: string, format: DownloadFormat, confirm: boolean, d: DownloadDeps): Promise<Result<Download>> {
  const until = d.now() + DOWNLOAD_WAIT_MS;
  for (;;) {
    const r = await d.api.download(id, { format, confirm });
    if (!r.ok || urlOf(r.value) !== null || r.value.status !== "processing" || d.now() >= until) return r;
    await d.sleep(DOWNLOAD_POLL_MS);
  }
}

/** Suno's answer that carried no file, in its own words. */
export function noFile(r: Download, title: string): Result<never> {
  if (r.status === "processing") return err("unavailable", `suno is still preparing "${title}"; press again`, { detail: "suno-download-processing" });
  return err("refused", r.message ?? `suno download of "${title}" answered ${r.status}`, { detail: "suno-download" });
}

/** Spend the credit the person confirmed, under a receipt: the file's URL, or the refusal. */
export async function paidUrl(id: string, format: DownloadFormat, title: string, d: DownloadDeps): Promise<Result<string>> {
  if (d.dryOnly) return err("refused", `GRAVITONE_DRY_ONLY=1 pins this server dry: "${title}" was not downloaded and no download credit was spent`, { detail: "suno-download-dry" });
  const store = d.store();
  if (!store.ok) return store;
  const key: ReceiptKey = { scope: DOWNLOAD_SCOPE, key: `${id}:${format}`, mode: "live" };
  const claim = store.value.tx((t) => claimReceipt(t, key, `${id}:${format}`, paidSchema, d.actor));
  if (!claim.ok) return err(claim.error.code, `suno download of "${title}": ${claim.error.message}`);
  if (claim.value.kind === "replay") return ok(claim.value.value.url);
  // A release that fails leaves a pending claim, which recovery names as interrupted (receipts.ts).
  const release = (why: string): void => void store.value.tx((t) => releaseReceipt(t, key, d.actor, why));

  const r = await downloadUntilReady(id, format, true, d);
  if (!r.ok) {
    release(`suno refused the download: ${r.error.message}`);
    return r;
  }
  const url = urlOf(r.value);
  if (url === null) {
    release(`suno answered ${r.value.status} without a file`);
    return noFile(r.value, title);
  }
  const left = r.value.credits_remaining ?? undefined;
  const note = `1 suno download credit${left !== undefined ? ` (${left} left)` : ""}; not priced in USD`;
  const settled = store.value.tx((t) => settleReceipt(t, key, { url, format, ...(left !== undefined ? { left } : {}) }, { usd: null, basis: "unpriced", note }, d.actor));
  if (!settled.ok) return err("internal", `suno download of "${title}" was paid but its receipt could not be settled: ${settled.error.message}`);
  return ok(url);
}

export async function pullSunoTake(input: PullInput, d: PullDeps): Promise<Result<Pulled>> {
  const held = await d.held(input.clipId);
  if (!held.ok) return held;
  if (held.value !== null) return ok({ facts: held.value });

  const clip = await d.api.getClip(input.clipId);
  if (!clip.ok) return clip;
  const title = clip.value.title ?? input.clipId;
  if (phaseOf(clip.value.status) !== "complete") return err("conflict", `suno song "${title}" is ${clip.value.status}, not complete`, { detail: "suno-clip-not-complete" });
  const format = input.format ?? "mp3";

  let url: string;
  if (input.confirm === true) {
    const paid = await paidUrl(input.clipId, format, title, d);
    if (!paid.ok) return paid;
    url = paid.value;
  } else {
    const q = await downloadUntilReady(input.clipId, format, false, d);
    if (!q.ok) return q;
    const free = urlOf(q.value);
    if (free === null) {
      if (q.value.status !== "requires_credit") return noFile(q.value, title);
      const left = q.value.credits_remaining ?? undefined;
      return ok({ quote: { clipId: input.clipId, credits: 1, format, ...(left !== undefined ? { left } : {}) } });
    }
    url = free;
  }

  let bytes: Uint8Array;
  try {
    bytes = await d.fetchBytes(url);
  } catch (e) {
    return err("unavailable", errorMessage(e), { detail: "suno-download" });
  }

  const from: TakeFrom = { session: input.session, sunoClipId: input.clipId, ...(input.promptId !== undefined ? { promptId: input.promptId } : {}), ...(input.clip !== undefined ? { clip: input.clip } : {}) };
  const ext = audioExtOf(url, `.${format}`);
  const filed = await d.measureAndFile({ bytes, mime: AUDIO_EXT[ext] ?? "audio/mpeg", name: pulledName(clip.value.title, input.clipId, ext) }, from);
  if (!filed.ok) return filed;
  const read = await d.read(filed.value.takeId);
  return read.ok ? ok({ facts: read.value }) : ok({ facts: filed.value, readRefused: read.error.message });
}

/** One library row as the picker lists it; an absent value is an omitted key. */
export function songOf(c: Clip): SunoSong {
  const d = c.metadata?.duration;
  return {
    id: c.id,
    title: (c.title ?? "").trim() || c.id,
    status: c.status,
    ...(typeof d === "number" && d > 0 ? { durationS: d } : {}),
    ...(c.created_at ? { createdAt: c.created_at } : {}),
    ...(c.cover_image_url ? { imageUrl: c.cover_image_url } : {}),
  };
}

export type SongPage = { readonly songs: readonly SunoSong[]; readonly next?: string };

/** One page of the person's library: their search when they typed one, else the newest songs. */
export async function libraryPage(api: Pick<SunoApi, "listLibrary" | "searchLibrary">, q: { readonly query?: string; readonly cursor?: string }): Promise<Result<SongPage>> {
  const query = q.query?.trim() ?? "";
  const page = { ...(q.cursor !== undefined ? { cursor: q.cursor } : {}), limit: 20 };
  const r = query === "" ? await api.listLibrary(page) : await api.searchLibrary({ ...page, query });
  if (!r.ok) return r;
  const next = r.value.next_cursor;
  return ok({ songs: r.value.items.map(songOf), ...(next ? { next } : {}) });
}

/** The process's own dependencies. Imported here, not at the top: the kernel store is server-only and
 *  the measure step reaches the sidecar - no test that hands its own dependencies should load them. */
export async function pullDeps(actor: Actor = { kind: "operator", id: "operator" }): Promise<PullDeps> {
  const [{ sunoApi }, { fetchClipBytes }, { measureAndFile }, { factsOfSunoClip }, { readSunoTake, sunoReadDeps }, { kernel }] = await Promise.all([
    import("../../suno/api/client.ts"),
    import("../mv/fetchAudio.ts"),
    import("./measure.ts"),
    import("./facts.ts"),
    import("./sunoRead.ts"),
    import("../../kernelStore.ts"),
  ]);
  const readDeps = await sunoReadDeps();
  return {
    api: sunoApi(),
    fetchBytes: fetchClipBytes,
    measureAndFile: (file, from) => measureAndFile(file, from),
    held: factsOfSunoClip,
    read: (takeId) => readSunoTake(takeId, readDeps),
    store: () => {
      const k = kernel();
      return k.ok ? ok(k.value.store) : k;
    },
    actor,
    dryOnly: process.env.GRAVITONE_DRY_ONLY === "1",
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  };
}
