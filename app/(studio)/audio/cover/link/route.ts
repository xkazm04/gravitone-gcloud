// POST /audio/cover/link - the song a cover starts from, fetched from a YouTube link (cover from a link, WP-C). JSON
// `{ url, rights, title?, holder?, note? }`, held by @gt/domain/cover.schema coverLinkSchema: the rights declared
// with no default, as the file door's are. Answers `{ id }`: a cover in `draft` whose `source.url` is the canonical
// link (registry: rights-and-provenance-record), exactly as the file door would have made it from the same mp3.
//
// The link is judged before anything runs (lib/sound/cover/link/parse.ts); yt-dlp reads the video's length and title,
// refuses past 20 minutes before downloading, and extracts the audio to mp3 (lib/sound/cover/link/youtube.ts). The
// duration on the record is still ffprobe's on the downloaded bytes (../../_cover/upload.ts measuredBytes), not
// YouTube's claim. Access-gated and same-origin through route(), not money: nothing here spends. The brief that
// follows on the desk is priced on its own receipt.
//
// maxDuration 300 s: a 20-minute video's audio downloads in well under that on this box's line; the download itself
// is held to 270 s (youtube.ts DOWNLOAD_MS) so a slow one fails in yt-dlp's words before the route's deadline.
import { COVER_TITLE_MAX } from "@gt/domain/cover";
import { coverLinkSchema } from "@gt/domain/cover.schema";
import { ok, type Result } from "@gt/domain/errors";

import { route } from "../../../../_server/route.ts";
import { createCover } from "../../../../../lib/sound/cover/store.ts";
import { fetchYouTubeAudio, linkDepsFrom, parseYouTubeUrl } from "../../../../../lib/sound/cover/link/youtube.ts";
import { measuredBytes } from "../../_cover/upload.ts";

export const maxDuration = 300;

const LINK_BODY_CAP = 8 * 1024;

export const POST = route({ guard: "access", bodyCap: LINK_BODY_CAP, maxDuration, input: coverLinkSchema }, async ({ input }): Promise<Result<{ readonly id: string }>> => {
  const link = parseYouTubeUrl(input.url);
  if (!link.ok) return link;
  const audio = await fetchYouTubeAudio(link.value.url, linkDepsFrom());
  if (!audio.ok) return audio;
  const durationS = await measuredBytes(audio.value.bytes, audio.value.name, ".mp3");
  if (!durationS.ok) return durationS;
  const { rights, holder, note } = input;
  const title = (input.title ?? audio.value.title).slice(0, COVER_TITLE_MAX).trim() || "untitled";
  const c = await createCover({
    title,
    rights,
    ...(holder === undefined ? {} : { holder }),
    ...(note === undefined ? {} : { note }),
    source: { bytes: audio.value.bytes, mime: audio.value.mime, name: audio.value.name, durationS: durationS.value, url: link.value.url },
  });
  return ok({ id: c.id });
});
