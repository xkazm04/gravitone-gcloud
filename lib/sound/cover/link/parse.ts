// A YOUTUBE LINK, JUDGED (cover from a link, WP-C). Pure and client-safe: the link field on the desk
// (app/(studio)/audio/_cover/desk/link/) imports this same judge, so the browser and the door refuse in the same
// words. Only https on YouTube's own hosts, one video named by its 11-character id; the answer is the canonical
// watch link, which is what the record keeps as the source's provenance (registry: rights-and-provenance-record).
// A link that names a playlist and no video is refused: a cover starts from one song.
import { err, ok, type Result } from "@gt/domain/errors";

export type YouTubeLink = { readonly id: string; readonly url: string };

const WATCH_HOSTS: ReadonlySet<string> = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const SHORT_HOST = "youtu.be";
/** The video paths besides /watch?v=: the id is the segment after them. */
const PATH_FORMS: readonly string[] = ["shorts", "live"];
const ID = /^[A-Za-z0-9_-]{11}$/;

export const canonicalYouTubeUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`;

const shown = (s: string): string => (s.length > 80 ? `${s.slice(0, 80)}…` : s);

function idOf(u: URL): Result<string> {
  const segs = u.pathname.split("/").filter((p) => p !== "");
  let id: string | undefined;
  if (u.hostname === SHORT_HOST) id = segs[0];
  else if (segs[0] === "watch" && segs.length === 1) id = u.searchParams.get("v") ?? undefined;
  else if (segs[0] !== undefined && PATH_FORMS.includes(segs[0]) && segs.length >= 2) id = segs[1];
  if (id === undefined || id === "") {
    if (u.searchParams.has("list")) return err("invalid", "a playlist link names no one video; copy the link of the video itself");
    return err("invalid", `${shown(u.href)} names no video`);
  }
  if (!ID.test(id)) return err("invalid", `"${shown(id)}" is not a YouTube video id (11 letters, digits, - or _)`);
  return ok(id);
}

/** One YouTube video's link, or why not, in words. */
export function parseYouTubeUrl(raw: string): Result<YouTubeLink> {
  const text = raw.trim();
  if (text === "") return err("invalid", "no link");
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return err("invalid", `"${shown(text)}" is not a link`);
  }
  if (u.protocol !== "https:") return err("invalid", `a ${u.protocol.replace(/:$/, "")} link; a YouTube link is https`);
  if (u.username !== "" || u.password !== "" || u.port !== "") return err("invalid", "a link with a user or a port is not YouTube's");
  const host = u.hostname.toLowerCase();
  if (!WATCH_HOSTS.has(host) && host !== SHORT_HOST) return err("invalid", `${host} is not YouTube (youtube.com, music.youtube.com, youtu.be)`);
  const id = idOf(u);
  if (!id.ok) return id;
  return ok({ id: id.value, url: canonicalYouTubeUrl(id.value) });
}
