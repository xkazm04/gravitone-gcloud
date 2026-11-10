// PULL A TAKE FROM SUNO (spark suno-api): a song in the person's Suno library - one they made on
// suno.com, or a clip a create returned - filed as a studio take that carries its Suno clip id, so
// Suno's own free reads can be asked of it (./sunoRead.ts). Upload stays for files made elsewhere.
//
// THE BYTES ARE HYBRID. Suno's official API refuses to stream suno.com songs, so the clip is checked
// through the API (it must be `complete`), its audio URL is resolved inside the signed-in Chrome
// profile (lib/suno/driver.ts resolveSunoAudio), and the bytes come from that CDN URL (lib/sound/mv/
// fetchAudio.ts fetchClipBytes). Then the same step an upload goes through (./measure.ts): measured
// before filed. Every refusal is the answer in its source's own words - the API's, the browser
// driver's (`suno browser not running`, `not signed in to suno`), the CDN's, the decoder's - and a
// refused pull files nothing. A song this server already pulled answers the take it already holds.
//
// Nothing here spends: reading a clip and resolving its URL are free, and the download is the CDN
// file the person's own library already serves.
import type { StudioTakeFacts, SunoSong } from "@gt/domain/audio.suno";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";

import type { SunoApi } from "../../suno/api/client.ts";
import type { Clip } from "../../suno/api/wire.ts";
import type { IncomingFile } from "../takes.ts";
import type { TakeFrom } from "./facts.ts";
import { phaseOf } from "./sunoRead.ts";

export type PullInput = { readonly session: string; readonly clipId: string; readonly promptId?: string; readonly clip?: "a" | "b" };

export type PullDeps = {
  readonly api: Pick<SunoApi, "getClip">;
  /** lib/suno/driver.ts resolveSunoAudio: song id -> its audio URL, null when the page cannot see it. */
  readonly resolveAudio: (ids: readonly string[]) => Promise<Map<string, string | null>>;
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  readonly measureAndFile: (file: IncomingFile, from: TakeFrom) => Promise<Result<StudioTakeFacts>>;
  /** A take already pulled from this song (null: none). */
  readonly held: (clipId: string) => Promise<Result<StudioTakeFacts | null>>;
  /** Suno's free read, asked once the take is filed (./sunoRead.ts readSunoTake). */
  readonly read: (takeId: string) => Promise<Result<StudioTakeFacts>>;
};

/** The pulled take, and the read's refusal in Suno's words when the read did not go (the take is filed either way). */
export type Pulled = { readonly facts: StudioTakeFacts; readonly readRefused?: string };

/** A file name from the song's title: what a person would have saved it as. */
export function pulledName(title: string | null | undefined, clipId: string): string {
  const t = (title ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return `${t === "" ? clipId : t}.mp3`;
}

export async function pullSunoTake(input: PullInput, d: PullDeps): Promise<Result<Pulled>> {
  const held = await d.held(input.clipId);
  if (!held.ok) return held;
  if (held.value !== null) return ok({ facts: held.value });

  const clip = await d.api.getClip(input.clipId);
  if (!clip.ok) return clip;
  const title = clip.value.title ?? input.clipId;
  if (phaseOf(clip.value.status) !== "complete") return err("conflict", `suno song "${title}" is ${clip.value.status}, not complete`, { detail: "suno-clip-not-complete" });

  let url: string | null | undefined;
  try {
    url = (await d.resolveAudio([input.clipId])).get(input.clipId);
  } catch (e) {
    return err("unavailable", errorMessage(e), { detail: "suno-browser" });
  }
  if (url === null || url === undefined || url === "") return err("not-found", `the signed-in suno page has no audio URL for "${title}" (${input.clipId})`, { detail: "suno-no-audio-url" });

  let bytes: Uint8Array;
  try {
    bytes = await d.fetchBytes(url);
  } catch (e) {
    return err("unavailable", errorMessage(e), { detail: "suno-download" });
  }

  const from: TakeFrom = { session: input.session, sunoClipId: input.clipId, ...(input.promptId !== undefined ? { promptId: input.promptId } : {}), ...(input.clip !== undefined ? { clip: input.clip } : {}) };
  const filed = await d.measureAndFile({ bytes, mime: "audio/mpeg", name: pulledName(clip.value.title, input.clipId) }, from);
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

/** The process's own dependencies. Imported here, not at the top: the browser driver pulls Playwright,
 *  which no test that hands its own dependencies should load. */
export async function pullDeps(): Promise<PullDeps> {
  const [{ sunoApi }, { resolveSunoAudio }, { fetchClipBytes }, { measureAndFile }, { factsOfSunoClip }, { readSunoTake, sunoReadDeps }] = await Promise.all([
    import("../../suno/api/client.ts"),
    import("../../suno/driver.ts"),
    import("../mv/fetchAudio.ts"),
    import("./measure.ts"),
    import("./facts.ts"),
    import("./sunoRead.ts"),
  ]);
  const readDeps = await sunoReadDeps();
  return {
    api: sunoApi(),
    resolveAudio: resolveSunoAudio,
    fetchBytes: fetchClipBytes,
    measureAndFile: (file, from) => measureAndFile(file, from),
    held: factsOfSunoClip,
    read: (takeId) => readSunoTake(takeId, readDeps),
  };
}
