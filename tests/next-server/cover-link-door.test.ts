// POST /audio/cover/link (cover from a link, WP-C) over the real cover store in a temp dir, with the fetch stood in
// (lib/sound/cover/link/youtube.ts fetchYouTubeAudio answers a 12 s mp3 ffmpeg made here) and the link judge real.
// ffprobe IS the subject: the duration on the record is the decoder's on the fetched bytes, not the probe's claim,
// so the lane that needs a real mp3 SKIPS, saying why, on a box without ffmpeg.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-cover-link-door-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "sound-ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

const fetched = vi.hoisted(() => ({ urls: [] as string[], bytes: new Uint8Array(), claimS: 999 }));

vi.mock("../../lib/sound/cover/link/youtube.ts", async (actual) => {
  const real = await actual<typeof import("../../lib/sound/cover/link/youtube.ts")>();
  return {
    ...real,
    fetchYouTubeAudio: async (url: string) => {
      fetched.urls.push(url);
      return { ok: true, value: { bytes: fetched.bytes, mime: "audio/mpeg", name: "Rain on Tin [dQw4w9WgXcQ].mp3", title: "Rain on Tin", durationS: fetched.claimS } };
    },
  };
});

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { POST as LINK } from "../../app/(studio)/audio/cover/link/route.ts";
import { COVER_LINK_ROUTE } from "../../app/(studio)/audio/_cover/contract.ts";
import { ACCESS_SECRET_VAR, __resetRateLimit } from "../../lib/apiAuth.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { listCovers, readCover } from "../../lib/sound/cover/store.ts";

vi.setConfig({ testTimeout: 60_000 });

const ENV = [ACCESS_SECRET_VAR, "PRINCIPAL_MODE", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const AUTH = { authorization: "Bearer cover-secret", "content-type": "application/json" };
const BASE = "http://127.0.0.1:3111";

const FFMPEG = process.env["FFMPEG"]?.trim() || "ffmpeg";
const MP3 = path.join(ROOT, "tone.mp3");
const NO_FFMPEG = ((): string | null => {
  const r = spawnSync(FFMPEG, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-c:a", "libmp3lame", "-b:a", "128k", MP3], { encoding: "utf8", timeout: 60_000, windowsHide: true });
  return r.status === 0 && existsSync(MP3) ? null : `${FFMPEG} did not make an mp3: ${(r.error?.message ?? r.stderr ?? "").trim().slice(-200)}`;
})();
if (NO_FFMPEG !== null) console.warn(`cover-link-door ffprobe lane skipped: ${NO_FFMPEG}`);

beforeAll(() => {
  for (const k of ENV) delete process.env[k];
  process.env[ACCESS_SECRET_VAR] = "cover-secret";
});
afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
  for (const k of ENV) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const post = (body: unknown, headers: Record<string, string> = AUTH): Promise<Response> => {
  __resetRateLimit();
  return LINK(new Request(`${BASE}${COVER_LINK_ROUTE}`, { method: "POST", body: JSON.stringify(body), headers }));
};
const errorOf = async (r: Response): Promise<string> => ((await r.json()) as { error: string }).error;
const count = async (): Promise<number> => (await listCovers()).length;

describe("POST /audio/cover/link", () => {
  it("fails closed: nothing presented is 401, nothing fetched, no cover", async () => {
    fetched.urls.length = 0;
    const r = await post({ url: "https://youtu.be/dQw4w9WgXcQ", rights: "own" }, { "content-type": "application/json" });
    expect(r.status).toBe(401);
    expect(fetched.urls).toEqual([]);
    expect(await count()).toBe(0);
  });

  it("refuses a link with no rights declared, and an unknown declaration, fetching nothing", async () => {
    fetched.urls.length = 0;
    const none = await post({ url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(none.status).toBe(400);
    expect(await errorOf(none)).toContain("rights");
    const unknown = await post({ url: "https://youtu.be/dQw4w9WgXcQ", rights: "public-domain" });
    expect(unknown.status).toBe(400);
    expect(await errorOf(unknown)).toContain("rights");
    expect(fetched.urls).toEqual([]);
    expect(await count()).toBe(0);
  });

  it("refuses a link off YouTube in the judge's words, fetching nothing", async () => {
    fetched.urls.length = 0;
    const r = await post({ url: "https://vimeo.com/76979871", rights: "own" });
    expect(r.status).toBe(400);
    expect(await errorOf(r)).toBe("vimeo.com is not YouTube (youtube.com, music.youtube.com, youtu.be)");
    expect(fetched.urls).toEqual([]);
    expect(await count()).toBe(0);
  });

  it.skipIf(NO_FFMPEG !== null)("makes a draft cover from a good link: the canonical source.url, ffprobe's duration, the video's title", async () => {
    fetched.urls.length = 0;
    fetched.bytes = new Uint8Array(readFileSync(MP3));
    const r = await post({ url: "https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=abc", rights: "third-party-uncleared", holder: "Rain Co" });
    const body = (await r.json()) as { id: string };
    expect(r.status, JSON.stringify(body)).toBe(200);
    expect(fetched.urls).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
    const c = await readCover(body.id);
    expect(c).toMatchObject({ title: "Rain on Tin", rights: "third-party-uncleared", holder: "Rain Co", state: "draft", source: { mime: "audio/mpeg", name: "Rain on Tin [dQw4w9WgXcQ].mp3", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });
    // The decoder's 12 s, not the probe's claimed 999.
    expect(c?.source.durationS).toBeGreaterThan(11.5);
    expect(c?.source.durationS).toBeLessThan(12.5);
    // An owner's title wins over the video's.
    const named = await post({ url: "https://youtu.be/dQw4w9WgXcQ", rights: "own", title: "Tin Roof" });
    const id = ((await named.json()) as { id: string }).id;
    expect((await readCover(id))?.title).toBe("Tin Roof");
  });

  it.skipIf(NO_FFMPEG !== null)("refuses bytes ffprobe cannot read, in ffprobe's words, making nothing", async () => {
    fetched.bytes = new TextEncoder().encode("ID3 but not really");
    const before = await count();
    const r = await post({ url: "https://youtu.be/dQw4w9WgXcQ", rights: "own" });
    expect(r.ok).toBe(false);
    expect(await errorOf(r)).toMatch(/^Rain on Tin \[dQw4w9WgXcQ\]\.mp3 could not be read: ffprobe duration: /);
    expect(await count()).toBe(before);
  });
});
