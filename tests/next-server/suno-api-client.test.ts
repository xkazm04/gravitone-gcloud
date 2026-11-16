// SUNO REST CLIENT (lib/suno/api/client.ts) over a fake Suno and a temp sound store: a 401 refreshes once
// and retries once, a token about to expire is refreshed before the call, a body that does not parse is
// refused quoting what arrived, the vendor's refusal is its own sentence, stream hands back the bytes, the
// Content-Type and only the price/credit/quota headers, create reads `{clip_ids}`, and status reads the
// file without the network.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BASE, fakeSuno, type FakeSuno } from "./_sunoApiFake.ts";

import { sunoApi, sunoApiStatus } from "../../lib/suno/api/client.ts";
import { __resetDiscovery, beginAuthorization, completeAuthorization } from "../../lib/suno/api/oauth.ts";
import { readAuth, withAuthLock, writeAuth } from "../../lib/suno/api/tokens.ts";

let dir = "";
let suno: FakeSuno;
const saved = { sound: process.env["SOUND_STORE_DIR"], store: process.env["GRAVITONE_STORE_PATH"] };

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-suno-client-"));
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

const deps = () => ({ fetch: suno.fetch, base: BASE });
const USAGE = { allowed_models: ["v5"], features: [], metered_features: {}, suno_account: { credits_remaining: 120, plan: { name: "Pro", period: "month" } } };

async function connect(): Promise<void> {
  const a = await beginAuthorization("http://localhost:3000/api/suno/callback", deps());
  if (!a.ok) throw a.error;
  const c = await completeAuthorization(a.value.state, "good-code", deps());
  if (!c.ok) throw c.error;
  suno.calls.length = 0;
}

/** The REST answer for whichever bearer the server currently honours. */
const honouring = (body: unknown) => (c: { headers: Record<string, string> }) =>
  c.headers["authorization"] === `Bearer ${suno.live.access}` ? Response.json(body) : Response.json({ error: "invalid token", code: "unauthorized" }, { status: 401 });

describe("sunoApi", () => {
  it("answers not connected without a call when no grant is held", async () => {
    const r = await sunoApi(deps()).usage();
    expect(r.ok).toBe(false);
    if (!r.ok) expect([r.error.code, r.error.message]).toEqual(["unauthenticated", "not connected to suno"]);
    expect(suno.calls).toHaveLength(0);
  });

  it("sends the bearer and parses usage", async () => {
    await connect();
    suno.rest("GET /v0/account/usage", honouring(USAGE));
    const r = await sunoApi(deps()).usage();
    expect(r.ok && r.value.suno_account?.credits_remaining).toBe(120);
    expect(suno.calls[0]!.headers["authorization"]).toBe("Bearer at-1");
  });

  it("on a 401 refreshes once and retries once", async () => {
    await connect();
    suno.live.access = "at-rotated-elsewhere"; // the server no longer honours at-1
    suno.rest("GET /v0/account/usage", honouring(USAGE));
    // The fake mints at-<n> on refresh: honour whatever it mints next.
    const r = await sunoApi(deps()).usage();
    expect(r.ok).toBe(true);
    expect(suno.grants("refresh_token")).toHaveLength(1);
    const rest = suno.calls.filter((c) => c.url.startsWith(`${BASE}/v0/`));
    expect(rest.map((c) => c.headers["authorization"])).toEqual(["Bearer at-1", "Bearer at-2"]);
    expect((await readAuth()).tokens?.accessToken).toBe("at-2");
  });

  it("a second 401 is the answer, in the vendor's words - one refresh, no loop", async () => {
    await connect();
    suno.rest("GET /v0/me", () => Response.json({ error: "missing API key", code: "unauthorized" }, { status: 401 }));
    const r = await sunoApi(deps()).me();
    expect(r.ok).toBe(false);
    if (!r.ok) expect([r.error.code, r.error.message, r.error.detail]).toEqual(["unauthenticated", "missing API key", "unauthorized"]);
    expect(suno.grants("refresh_token")).toHaveLength(1);
    expect(suno.calls.filter((c) => c.url === `${BASE}/v0/me`)).toHaveLength(2);
  });

  it("refreshes before the call when the token expires within 60 s", async () => {
    await connect();
    const auth = await readAuth();
    await withAuthLock(() => writeAuth({ ...auth, tokens: { ...auth.tokens!, expiresAt: Date.now() + 30_000 } }));
    suno.rest("GET /v0/audio/clip-1", honouring({ id: "clip-1", status: "complete", title: "One", metadata: { duration: 181.2 } }));
    const r = await sunoApi(deps()).getClip("clip-1");
    expect(r.ok && r.value.metadata?.duration).toBe(181.2);
    expect(suno.grants("refresh_token")).toHaveLength(1);
    expect(suno.calls.filter((c) => c.url.startsWith(`${BASE}/v0/`))).toHaveLength(1);
  });

  it("a body that does not parse is refused quoting the first 300 characters of what arrived", async () => {
    await connect();
    const odd = { items: "not-a-list", next_cursor: null, padding: "x".repeat(400) };
    suno.rest("GET /v0/library?limit=50", () => Response.json(odd));
    const r = await sunoApi(deps()).listLibrary({ limit: 500 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.detail).toBe("suno-shape");
      expect(r.error.message).toContain(`arrived: ${JSON.stringify(odd).slice(0, 300)}`);
      expect(r.error.message).not.toContain("x".repeat(320));
    }
  });

  it("search sends query, cursor and limit", async () => {
    await connect();
    suno.rest("GET /v0/library/search?query=night+drive&cursor=c2&limit=10", () => Response.json({ items: [{ id: "a", status: "complete" }], next_cursor: "c3" }));
    const r = await sunoApi(deps()).searchLibrary({ query: "night drive", cursor: "c2", limit: 10 });
    expect(r.ok && [r.value.items[0]!.id, r.value.next_cursor]).toEqual(["a", "c3"]);
  });

  it("create accepts {clip_ids} and a clip, and posts the body as JSON", async () => {
    await connect();
    let sent = "";
    suno.rest("POST /v0/audio", (c) => {
      sent = c.body;
      return Response.json({ clip_ids: ["c1", "c2"] });
    });
    const r = await sunoApi(deps()).create({ lyrics: "la", style: "lofi", title: "T", idempotency_key: "k1" });
    expect(r.ok && r.value.clipIds).toEqual(["c1", "c2"]);
    expect(JSON.parse(sent)).toEqual({ lyrics: "la", style: "lofi", title: "T", idempotency_key: "k1" });
    suno.rest("POST /v0/audio", () => Response.json({ id: "c9", status: "queued" }));
    const one = await sunoApi(deps()).create({ description: "a song" });
    expect(one.ok && [one.value.clipIds, one.value.clips[0]?.status]).toEqual([["c9"], "queued"]);
  });

  it("listen posts the question; listenRead reads the answer", async () => {
    await connect();
    let q = "";
    suno.rest("POST /v0/audio/c1/listen", (c) => {
      q = JSON.parse(c.body).question;
      return Response.json({ id: "l1", audio_id: "c1", status: "processing", created_at: "2026-11-10T00:00:00Z" });
    });
    suno.rest("GET /v0/audio/listens/l1", () => Response.json({ id: "l1", audio_id: "c1", status: "complete", answer: "128 bpm" }));
    const api = sunoApi(deps());
    expect((await api.listen("c1", "what tempo?")).ok).toBe(true);
    expect(q).toBe("what tempo?");
    const r = await api.listenRead("l1");
    expect(r.ok && r.value.answer).toBe("128 bpm");
  });

  it("stream returns the bytes, the Content-Type and only the price/credit/quota headers", async () => {
    await connect();
    suno.rest("GET /v0/audio/c1/stream", () => new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { "content-type": "audio/mpeg", "x-credits-remaining": "120", "set-cookie": "s=1", "x-request-id": "r" },
    }));
    const r = await sunoApi(deps()).stream("c1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.value.bytes]).toEqual([1, 2, 3, 4]);
    expect(r.value.mime).toBe("audio/mpeg");
    expect(r.value.billingHeaders).toEqual({ "x-credits-remaining": "120" });
  });

  it("stream's refusal is the vendor's sentence", async () => {
    await connect();
    suno.rest("GET /v0/audio/c1/stream", () => Response.json({ error: "clip is not finished", code: "conflict" }, { status: 409 }));
    const r = await sunoApi(deps()).stream("c1");
    expect(!r.ok && [r.error.code, r.error.message]).toEqual(["conflict", "clip is not finished"]);
  });
});

describe("sunoApiStatus", () => {
  it("reads the file only", async () => {
    expect(await sunoApiStatus()).toEqual({ connected: false, reason: "not connected to suno" });
    await connect();
    const s = await sunoApiStatus();
    expect(s.connected && s.scope).toBe("api:v0 offline_access");
    expect(suno.calls).toHaveLength(0);
  });
});
