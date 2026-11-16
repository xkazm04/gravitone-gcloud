// THE SUNO CLIENT'S UPLOAD AND COVER (lib/suno/api/client.ts; spark suno-covers WP1) over a fake Suno and a temp sound
// store - a stand-in: no network. uploadSession posts the title; putUpload PUTs the raw bytes to the signed URL with the
// content-type and NO bearer, and a refusal is the status and the body text; completeUpload answers the clip; cover posts
// the parsed CoverBody to /covers and reads one clip or clip_ids, a body it refuses never leaving the process.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BASE, fakeSuno, type FakeSuno } from "./_sunoApiFake.ts";

import { sunoApi } from "../../lib/suno/api/client.ts";
import { __resetDiscovery, beginAuthorization, completeAuthorization } from "../../lib/suno/api/oauth.ts";

let dir = "";
let suno: FakeSuno;
const saved = { sound: process.env["SOUND_STORE_DIR"], store: process.env["GRAVITONE_STORE_PATH"] };
const S3 = "https://s3.example/signed/up-1?sig=abc";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-cover-suno-client-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  __resetDiscovery();
  suno = fakeSuno();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of [["SOUND_STORE_DIR", saved.sound], ["GRAVITONE_STORE_PATH", saved.store]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

type Put = { readonly url: string; readonly method: string; readonly headers: Record<string, string>; readonly bytes: number };

/** Suno's fake plus the signed URL's host, which answers `status`/`body` to the PUT. */
function deps(put: { status: number; body: string }, puts: Put[] = []) {
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://s3.example/")) return suno.fetch(input, init);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    puts.push({ url, method: init.method ?? "GET", headers, bytes: (init.body as Uint8Array | undefined)?.byteLength ?? 0 });
    return new Response(put.body, { status: put.status });
  }) as typeof fetch;
  return { fetch: f, base: BASE };
}

async function connect(d: ReturnType<typeof deps>): Promise<void> {
  const a = await beginAuthorization("http://localhost:3000/api/suno/callback", d);
  if (!a.ok) throw a.error;
  const c = await completeAuthorization(a.value.state, "good-code", d);
  if (!c.ok) throw c.error;
  suno.calls.length = 0;
}

describe("the upload", () => {
  it("uploadSession posts the title; completeUpload posts to the session and answers the clip", async () => {
    const d = deps({ status: 200, body: "" });
    await connect(d);
    let sent = "";
    suno.rest("POST /v0/audio/upload-sessions", (c) => {
      sent = c.body;
      return Response.json({ id: "up-1", upload_url: S3, upload_page_url: "https://suno.com/upload/up-1" });
    });
    suno.rest("POST /v0/audio/upload-sessions/up-1/complete", () => Response.json({ id: "up-1", status: "submitted" }));
    const api = sunoApi(d);
    const s = await api.uploadSession("Tears");
    expect(s.ok && [s.value.id, s.value.upload_url]).toEqual(["up-1", S3]);
    expect(JSON.parse(sent)).toEqual({ title: "Tears" });
    const c = await api.completeUpload("up-1");
    expect(c.ok && [c.value.id, c.value.status]).toEqual(["up-1", "submitted"]);
    expect(suno.calls.map((x) => `${x.method} ${x.url.replace(BASE, "")}`)).toEqual(["POST /v0/audio/upload-sessions", "POST /v0/audio/upload-sessions/up-1/complete"]);
  });

  it("putUpload sends the raw bytes with the content-type and no bearer", async () => {
    const puts: Put[] = [];
    const d = deps({ status: 200, body: "" }, puts);
    await connect(d);
    const r = await sunoApi(d).putUpload(S3, new Uint8Array([1, 2, 3, 4, 5]), "audio/mpeg");
    expect(r.ok).toBe(true);
    expect(puts).toEqual([{ url: S3, method: "PUT", headers: { "content-type": "audio/mpeg" }, bytes: 5 }]);
    expect(puts[0]?.headers["authorization"]).toBeUndefined();
  });

  it("a refused PUT is the status and the body text", async () => {
    const d = deps({ status: 403, body: "<Error><Code>SignatureDoesNotMatch</Code></Error>" });
    await connect(d);
    const r = await sunoApi(d).putUpload(S3, new Uint8Array([1]), "audio/mpeg");
    expect(!r.ok && r.error.message).toBe("suno upload: the signed URL answered 403: <Error><Code>SignatureDoesNotMatch</Code></Error>");
  });

  it("a session Suno refuses is its own sentence", async () => {
    const d = deps({ status: 200, body: "" });
    await connect(d);
    suno.rest("POST /v0/audio/upload-sessions", () => Response.json({ error: "uploads are not on this plan", code: "forbidden" }, { status: 403 }));
    const r = await sunoApi(d).uploadSession("Tears");
    expect(!r.ok && [r.error.code, r.error.message]).toEqual(["refused", "uploads are not on this plan"]);
  });
});

describe("the cover", () => {
  const body = { style: "Dark synthwave", title: "Tears (suno 1)", model: "v6", controls: { variety: 2 }, idempotency_key: "gt-cover-cov-0123456789ab-1-1" };

  it("posts the parsed body to /covers and reads one clip, or clip_ids", async () => {
    const d = deps({ status: 200, body: "" });
    await connect(d);
    let sent = "";
    suno.rest("POST /v0/audio/up-1/covers", (c) => {
      sent = c.body;
      return Response.json({ id: "c1", status: "submitted" });
    });
    const api = sunoApi(d);
    const one = await api.cover("up-1", body);
    expect(one.ok && [one.value.clipIds, one.value.clips[0]?.status]).toEqual([["c1"], "submitted"]);
    expect(JSON.parse(sent)).toEqual(body);
    suno.rest("POST /v0/audio/up-1/covers", () => Response.json({ clip_ids: ["c2"] }));
    const ids = await api.cover("up-1", body);
    expect(ids.ok && ids.value.clipIds).toEqual(["c2"]);
  });

  it("a body the schema refuses never leaves the process; a 4xx is Suno's sentence", async () => {
    const d = deps({ status: 200, body: "" });
    await connect(d);
    const api = sunoApi(d);
    const bad = await api.cover("up-1", { ...body, duration: 5 });
    expect(!bad.ok && bad.error.detail).toBe("suno-cover-body");
    expect(suno.calls).toHaveLength(0);
    suno.rest("POST /v0/audio/up-1/covers", () => Response.json({ error: "duration must be between 15 and 360 seconds", code: "invalid_request" }, { status: 400 }));
    const r = await api.cover("up-1", body);
    expect(!r.ok && [r.error.code, r.error.message]).toEqual(["invalid", "duration must be between 15 and 360 seconds"]);
  });
});
