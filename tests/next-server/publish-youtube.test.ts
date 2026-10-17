import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { parseJsonAt } from "@gt/domain/door";
import type { Actor } from "@gt/domain/event";
import { blobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { getSlot, listPublicationsIn } from "@gt/kernel/slots/read";
import { publishByAct } from "@gt/kernel/slots/outcome";
import { createSlot } from "@gt/kernel/slots/write";
import { publishTick } from "@gt/producers/publish/tick";

import { blobRootOf } from "../../lib/kernelProcess.ts";
import { publishDeps } from "../../lib/producers/publish.ts";
import { sessionPath } from "../../lib/publish/sessions.ts";

// THE YOUTUBE BINDING (lib/producers/publish.ts over v1's client), with NO network: in dry mode
// globalThis.fetch is a stub that counts and refuses, and must count zero; in live mode the
// adapter is handed a fake wire that speaks the resumable-upload protocol, so what is pinned is
// the binding's own discipline - the session persisted before the first byte and dropped only once
// the publication is recorded, a heartbeat per accepted chunk, privacy private, and a session
// address that is not Google's refused at the header (outbound-notifications:
// destination-guard-integrity).

const dir = mkdtempSync(path.join(tmpdir(), "gt-publish-yt-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const OP: Actor = { kind: "operator", id: "op" };
const EXPORT = "0b1c2d3e-4f50-4617-8a9b-cafe0000aaaa";
const LIVE_ENV = { PUBLISH_MODE: "live", YOUTUBE_CLIENT_ID: "id", YOUTUBE_CLIENT_SECRET: "secret", YOUTUBE_REFRESH_TOKEN: "refresh" };

const ENV = ["PUBLISH_EXPORTS_DIR", "AD_EXPORT_DIR", "PUBLISH_STORE_DIR"] as const;
let saved: Record<string, string | undefined> = {};
let fetches: string[] = [];
const realFetch = globalThis.fetch;
let n = 0;
let k: Kernel;

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((e) => [e, process.env[e]]));
  const root = path.join(dir, `w-${++n}`);
  mkdirSync(path.join(root, "exports"), { recursive: true });
  process.env["PUBLISH_EXPORTS_DIR"] = path.join(root, "exports");
  process.env["PUBLISH_STORE_DIR"] = path.join(root, "publish");
  delete process.env["AD_EXPORT_DIR"];
  writeFileSync(path.join(root, "exports", `${EXPORT}.mp4`), Buffer.alloc(300_000, 7));
  fetches = [];
  globalThis.fetch = ((u: RequestInfo | URL) => {
    fetches.push(String(u));
    return Promise.reject(new Error("network refused by publish-youtube.test"));
  }) as typeof fetch;
  const opened = openKernel(path.join(root, "store.sqlite"));
  if (!opened.ok) throw opened.error;
  k = opened.value;
});
afterEach(() => {
  k.close();
  globalThis.fetch = realFetch;
  for (const e of ENV) {
    if (saved[e] === undefined) delete process.env[e];
    else process.env[e] = saved[e];
  }
});

function due(): string {
  const r = createSlot(k.store, { libraryItemId: `video:export:${EXPORT}`, channel: "youtube", at: new Date(Date.now() - 60_000).toISOString(), title: "A cut", description: "probe", tags: ["a", "b"] }, OP);
  if (!r.ok) throw r.error;
  return r.value.slot.id;
}

const planSchema = z.object({
  publicationId: z.string(),
  export: z.object({ id: z.string(), bytes: z.number(), sha256: z.string() }),
  requests: z.array(z.object({ method: z.string(), url: z.string(), headers: z.record(z.string(), z.string()), body: z.unknown().optional() })),
});

describe("dry, through the real binding", () => {
  it("publishes dry, keeps v1's plan (one resumable init, one PUT for 300 000 bytes, private, no Authorization), and calls fetch ZERO times", async () => {
    const deps = publishDeps({ store: k.store, env: { GRAVITONE_DRY_ONLY: "1", ...LIVE_ENV } });
    if (!deps.ok) throw deps.error;
    expect(deps.value.mode.kind).toBe("dry"); // live requested, dry-only process: dry
    const id = due();
    const r = await publishTick(deps.value, new Date());
    const o = r.ok ? r.value.outcomes[0] : undefined;
    if (o?.kind !== "published" || o.plan === undefined) throw new Error(JSON.stringify(r));
    expect(o.publication).toMatchObject({ slotId: id, dry: true, platformId: null, visibility: "private" });
    const bytes = await blobStore(blobRootOf(k.store)).read(o.plan.ref);
    if (!bytes.ok) throw bytes.error;
    const plan = parseJsonAt("plan", planSchema, new TextDecoder().decode(bytes.value));
    if (!plan.ok) throw plan.error;
    expect(plan.value.publicationId).toBe(o.publication.id);
    expect(plan.value.export).toMatchObject({ id: EXPORT, bytes: 300_000 });
    const [init, ...rest] = plan.value.requests;
    expect(init?.method).toBe("POST");
    expect(init?.url).toContain("uploadType=resumable");
    expect(JSON.stringify(init?.body)).toContain('"privacyStatus":"private"');
    expect(rest.filter((q) => q.method === "PUT")).toHaveLength(1);
    expect(plan.value.requests.some((q) => Object.keys(q.headers).some((h) => h.toLowerCase() === "authorization"))).toBe(false);
    expect(fetches).toEqual([]);
  });

  it("a slot whose export vanished drifts and is never fired; it fires once the export is back", async () => {
    const deps = publishDeps({ store: k.store, env: { GRAVITONE_DRY_ONLY: "1" } });
    if (!deps.ok) throw deps.error;
    const id = due();
    const file = path.join(process.env["PUBLISH_EXPORTS_DIR"] ?? "", `${EXPORT}.mp4`);
    rmSync(file);
    const r = await publishTick(deps.value, new Date());
    expect(r.ok && [r.value.drifted, r.value.outcomes]).toEqual([[id], []]);
    writeFileSync(file, Buffer.alloc(1000, 1));
    const again = await publishTick(deps.value, new Date());
    expect(again.ok && again.value.cleared).toEqual([id]);
    expect(again.ok && again.value.outcomes.map((x) => x.kind)).toEqual(["published"]);
  });
});

describe("a blog slot (L64: sl-art-<runId>, item article:<runId>)", () => {
  it("is wired and its article item exists to the sweep, so it neither drifts nor is uploaded; its approve's act publishes it", async () => {
    const deps = publishDeps({ store: k.store, env: { GRAVITONE_DRY_ONLY: "1" } });
    if (!deps.ok) throw deps.error;
    const r0 = createSlot(k.store, { id: "sl-art-run-1", libraryItemId: "article:run-1", channel: "blog", at: new Date(Date.now() - 60_000).toISOString(), title: "A post", description: "", tags: [] }, OP, await (async () => {
      const f = await deps.value.facts(Date.now());
      if (!f.ok) throw f.error;
      return f.value;
    })());
    if (!r0.ok) throw r0.error;
    const r = await publishTick(deps.value, new Date());
    expect(r.ok && [r.value.drifted, r.value.missed, r.value.outcomes]).toEqual([[], [], []]);
    const s = getSlot(k.store, "sl-art-run-1");
    expect(s.ok && [s.value.slot.state, s.value.slot.drift]).toEqual(["scheduled", undefined]);
    const landed = publishByAct(k.store, "sl-art-run-1", { platformId: "42", url: "https://github.com/org/ai-registry/pull/42", dry: false, publishedAt: new Date().toISOString() }, OP);
    expect(landed.ok && landed.value.slot.slot.state).toBe("published");
    expect(fetches).toEqual([]);
  });
});

/** A fake of the wire the client speaks: the token endpoint, the resumable init, chunked PUTs. */
function wire(opts: { location?: string; chunks?: number } = {}) {
  const calls: { method: string; url: string; redirect?: string }[] = [];
  let puts = 0;
  let sessionOnDiskAtFirstPut: boolean | undefined;
  const f = ((input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    calls.push({ method: init?.method ?? "GET", url: u, ...(init?.redirect === undefined ? {} : { redirect: init.redirect }) });
    if (u.startsWith("https://oauth2.googleapis.com/token")) return Promise.resolve(Response.json({ access_token: "tok", expires_in: 3600 }));
    if (init?.method === "POST" && u.includes("uploadType=resumable")) {
      return Promise.resolve(new Response(null, { status: 200, headers: { location: opts.location ?? "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc" } }));
    }
    if (init?.method === "PUT") {
      puts++;
      if (puts === 1) sessionOnDiskAtFirstPut = sessionFiles().length === 1;
      if (puts < (opts.chunks ?? 1)) return Promise.resolve(new Response(null, { status: 308, headers: { range: `bytes=0-${puts * 100_000 - 1}` } }));
      return Promise.resolve(Response.json({ id: "vid-123", status: { privacyStatus: "private" } }, { status: 201 }));
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  }) as typeof fetch;
  return { f, calls, sessionOnDiskAtFirstPut: () => sessionOnDiskAtFirstPut };
}

function sessionFiles(): string[] {
  const d = path.join(process.env["PUBLISH_STORE_DIR"] ?? "", "sessions");
  return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")) : [];
}

describe("live, over a fake wire", () => {
  it("persists the session before the first byte, heartbeats per accepted chunk, records the video, then drops the session", async () => {
    const w = wire({ chunks: 3 });
    let beats = 0;
    const deps = publishDeps({ store: k.store, env: LIVE_ENV, fetch: w.f });
    if (!deps.ok) throw deps.error;
    expect(deps.value.mode.kind).toBe("live");
    const id = due();
    const r = await publishTick(deps.value, new Date(), {
      beat: () => {
        beats++;
        return Promise.resolve();
      },
    });
    const o = r.ok ? r.value.outcomes[0] : undefined;
    expect(o?.kind === "published" && o.publication).toMatchObject({ dry: false, platformId: "vid-123", url: "https://www.youtube.com/watch?v=vid-123", visibility: "private" });
    expect(w.sessionOnDiskAtFirstPut()).toBe(true);
    expect(beats).toBe(2); // two 308s: two chunks accepted before the last
    const sp = sessionPath(id);
    expect(sp.ok && existsSync(sp.value)).toBe(false);
    expect(w.calls.every((c) => c.url.startsWith("https://oauth2.googleapis.com/") || c.redirect === "manual")).toBe(true);
    expect(fetches).toEqual([]); // the wire was the adapter's; the global fetch never ran
  });

  it("refuses a session address that is not Google's, before a byte or the token goes there; the slot says why", async () => {
    const w = wire({ location: "https://collector.example.net/upload?id=1" });
    const deps = publishDeps({ store: k.store, env: LIVE_ENV, fetch: w.f });
    if (!deps.ok) throw deps.error;
    const id = due();
    await publishTick(deps.value, new Date());
    const s = getSlot(k.store, id);
    expect(s.ok && s.value.slot).toMatchObject({ state: "failed" });
    expect(s.ok && s.value.slot.error).toMatch(/resumable session URI refused: https:\/\/collector\.example\.net/);
    expect(w.calls.some((c) => c.url.includes("collector.example.net"))).toBe(false);
    const pubs = k.store.read((rd) => listPublicationsIn(rd));
    expect(pubs.ok && pubs.value).toEqual([]);
  });

  it("does not resume a persisted session that points anywhere but Google: it starts a fresh one", async () => {
    const w = wire();
    const deps = publishDeps({ store: k.store, env: LIVE_ENV, fetch: w.f });
    if (!deps.ok) throw deps.error;
    const id = due();
    const sp = sessionPath(id);
    if (!sp.ok) throw sp.error;
    mkdirSync(path.dirname(sp.value), { recursive: true });
    // The right bytes, so only the address can be the reason it is not resumed.
    const sha = createHash("sha256").update(Buffer.alloc(300_000, 7)).digest("hex");
    writeFileSync(sp.value, JSON.stringify({ sessionUri: "http://169.254.169.254/latest", sha256: sha }));
    expect(readFileSync(sp.value, "utf8")).toContain("169.254");
    await publishTick(deps.value, new Date());
    expect(w.calls.some((c) => c.url.includes("169.254"))).toBe(false);
    const s = getSlot(k.store, id);
    expect(s.ok && s.value.slot.state).toBe("published");
  });
});
