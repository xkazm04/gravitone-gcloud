// A COVER FROM A YOUTUBE LINK (cover from a link, WP-C): the link judge (lib/sound/cover/link/parse.ts) on every form
// it takes and every one it refuses, and the fetch (lib/sound/cover/link/youtube.ts) over a fake spawn - a video past
// 20 minutes downloads nothing, a failed download answers yt-dlp's last stderr line, a missing binary the doctor's
// install line, and the temp folder is gone after success and failure alike. No network: the one real download is
// the builder's report, not a test.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { BIN_REMEDY, type Spawn, type SpawnOptions } from "../../lib/foundry/scout/ingest.ts";
import { parseYouTubeUrl } from "../../lib/sound/cover/link/parse.ts";
import { fetchYouTubeAudio, type LinkDeps } from "../../lib/sound/cover/link/youtube.ts";

const ID = "dQw4w9WgXcQ";
const CANON = `https://www.youtube.com/watch?v=${ID}`;

describe("parseYouTubeUrl", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&t=42s`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}&si=abc`],
    [`https://www.youtube.com/watch?v=${ID}&list=PL1234567890`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/live/${ID}?feature=share`],
    [`https://youtu.be/${ID}?si=xyz`],
    [`  https://youtu.be/${ID}  `],
  ])("accepts %s as the canonical watch link", (raw) => {
    expect(parseYouTubeUrl(raw)).toEqual({ ok: true, value: { id: ID, url: CANON } });
  });

  it.each([
    ["", "no link"],
    ["not a link", '"not a link" is not a link'],
    [`http://www.youtube.com/watch?v=${ID}`, "a http link; a YouTube link is https"],
    [`ftp://youtube.com/watch?v=${ID}`, "a ftp link; a YouTube link is https"],
    [`https://vimeo.com/watch?v=${ID}`, "vimeo.com is not YouTube (youtube.com, music.youtube.com, youtu.be)"],
    [`https://youtube.com.evil.example/watch?v=${ID}`, "youtube.com.evil.example is not YouTube (youtube.com, music.youtube.com, youtu.be)"],
    [`https://www.youtube.com:8443/watch?v=${ID}`, "a link with a user or a port is not YouTube's"],
    ["https://www.youtube.com/playlist?list=PL1234567890", "a playlist link names no one video; copy the link of the video itself"],
    ["https://www.youtube.com/watch?list=PL1234567890", "a playlist link names no one video; copy the link of the video itself"],
    ["https://www.youtube.com/watch", "https://www.youtube.com/watch names no video"],
    ["https://youtu.be/", "https://youtu.be/ names no video"],
    ["https://www.youtube.com/channel/UC123", "https://www.youtube.com/channel/UC123 names no video"],
    ["https://www.youtube.com/watch?v=short", '"short" is not a YouTube video id (11 letters, digits, - or _)'],
    [`https://youtu.be/${ID}x`, `"${ID}x" is not a YouTube video id (11 letters, digits, - or _)`],
  ])("refuses %j in words", (raw, words) => {
    const r = parseYouTubeUrl(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("invalid");
      expect(r.error.message).toBe(words);
    }
  });
});

const ROOT = mkdtempSync(path.join(os.tmpdir(), "gt-cover-link-"));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

type Call = { readonly bin: string; readonly args: readonly string[]; readonly opts: SpawnOptions };

/** A yt-dlp stand-in: the probe says `duration` and `title`; the download writes `<id>.mp3` where -o points, or fails. */
function fakeYtdlp(o: { durationS?: string; title?: string; fail?: string; missing?: boolean; leaveNothing?: boolean } = {}): { deps: LinkDeps; calls: Call[]; tmpRoot: string } {
  const calls: Call[] = [];
  const tmpRoot = mkdtempSync(path.join(ROOT, "run-"));
  const spawn: Spawn = async (bin, args, opts) => {
    calls.push({ bin, args, opts });
    if (o.missing === true) return { ok: false, error: `spawn ${bin} ENOENT` };
    if (args.includes("--skip-download")) return { ok: true, stdout: Buffer.from(`${o.durationS ?? "212"}\n${o.title ?? "Rain on Tin"}\n`), stderr: "" };
    if (o.fail !== undefined) return { ok: false, error: o.fail };
    const tpl = args[args.indexOf("-o") + 1] ?? "";
    const out = tpl.replace("%(id)s.%(ext)s", `${ID}.mp3`);
    if (o.leaveNothing === true) return { ok: true, stdout: Buffer.from(""), stderr: "[download] File is larger than max-filesize (90000000 bytes > 62914560 bytes). Aborting." };
    writeFileSync(out, "ID3 stand-in mp3");
    return { ok: true, stdout: Buffer.from(`${out}\n`), stderr: "" };
  };
  return { deps: { spawn, ytdlp: "yt-dlp", tmpRoot }, calls, tmpRoot };
}

describe("fetchYouTubeAudio", () => {
  it("probes, downloads the audio as mp3 with the scout's flags, answers its bytes and name, and leaves no temp folder", async () => {
    const f = fakeYtdlp();
    const r = await fetchYouTubeAudio(CANON, { ...f.deps, ffmpeg: "C:/ffmpeg/bin/ffmpeg.exe" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ mime: "audio/mpeg", name: `Rain on Tin [${ID}].mp3`, title: "Rain on Tin", durationS: 212 });
    expect(new TextDecoder().decode(r.value.bytes)).toBe("ID3 stand-in mp3");
    expect(f.calls).toHaveLength(2);
    const [probe, dl] = f.calls;
    expect(probe?.args).toEqual(expect.arrayContaining(["--skip-download", "--no-playlist", "--print", "duration", "title", CANON]));
    expect(probe?.args.join(" ")).toContain("--js-runtimes node");
    expect(dl?.args.join(" ")).toContain("-f bestaudio -x --audio-format mp3 --audio-quality 0 --max-filesize 60M");
    expect(dl?.args.join(" ")).toContain("--js-runtimes node");
    expect(dl?.args.join(" ")).toContain("--ffmpeg-location C:/ffmpeg/bin/ffmpeg.exe");
    expect(dl?.args).toContain("--no-playlist");
    expect(dl?.args.at(-1)).toBe(CANON);
    expect(dl?.opts.timeoutMs).toBeLessThan(300_000);
    expect(readdirSync(f.tmpRoot)).toEqual([]);
  });

  it("without FFMPEG hands yt-dlp no --ffmpeg-location", async () => {
    const f = fakeYtdlp();
    expect((await fetchYouTubeAudio(CANON, f.deps)).ok).toBe(true);
    expect(f.calls[1]?.args).not.toContain("--ffmpeg-location");
  });

  it("refuses a video past 20 minutes from the probe, downloading nothing and making no folder", async () => {
    const f = fakeYtdlp({ durationS: "1201" });
    const r = await fetchYouTubeAudio(CANON, f.deps);
    expect(r.ok ? "" : r.error.message).toBe("the video runs 20m01s; a cover's link takes at most 20m00s");
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.args).toContain("--skip-download");
    expect(readdirSync(f.tmpRoot)).toEqual([]);
  });

  it("takes a video of exactly 20 minutes", async () => {
    const f = fakeYtdlp({ durationS: "1200" });
    expect((await fetchYouTubeAudio(CANON, f.deps)).ok).toBe(true);
  });

  it("answers a failed download with yt-dlp's last stderr line verbatim, and removes the temp folder", async () => {
    const said = "ERROR: [youtube] dQw4w9WgXcQ: Video unavailable. This video is private";
    const f = fakeYtdlp({ fail: said });
    const r = await fetchYouTubeAudio(CANON, f.deps);
    expect(r.ok ? "" : r.error.message).toBe(`yt-dlp: ${said}`);
    expect(f.calls).toHaveLength(2);
    expect(readdirSync(f.tmpRoot)).toEqual([]);
  });

  it("says so when the download leaves no mp3 (past --max-filesize), and removes the temp folder", async () => {
    const f = fakeYtdlp({ leaveNothing: true });
    const r = await fetchYouTubeAudio(CANON, f.deps);
    expect(r.ok ? "" : r.error.message).toBe("yt-dlp: finished and left no mp3 ([download] File is larger than max-filesize (90000000 bytes > 62914560 bytes). Aborting.)");
    expect(readdirSync(f.tmpRoot)).toEqual([]);
  });

  it("refuses a missing yt-dlp with the doctor's install line", async () => {
    const f = fakeYtdlp({ missing: true });
    const r = await fetchYouTubeAudio(CANON, f.deps);
    expect(r.ok ? "" : r.error.message).toBe(`yt-dlp: spawn yt-dlp ENOENT -> ${BIN_REMEDY.ytdlp}`);
  });

  it("refuses a probe with no duration (a live stream) before downloading", async () => {
    const f = fakeYtdlp({ durationS: "NA" });
    const r = await fetchYouTubeAudio(CANON, f.deps);
    expect(r.ok ? "" : r.error.message).toBe(`yt-dlp: no duration for ${CANON} (NA); a live stream has none`);
    expect(f.calls).toHaveLength(1);
  });

  it("keeps a file name the store can hold from a title with path characters", async () => {
    const f = fakeYtdlp({ title: 'AC/DC: "Live" <1979>' });
    const r = await fetchYouTubeAudio(CANON, f.deps);
    expect(r.ok && r.value.name).toBe(`AC DC Live 1979 [${ID}].mp3`);
    expect(r.ok && r.value.title).toBe('AC/DC: "Live" <1979>');
  });
});
