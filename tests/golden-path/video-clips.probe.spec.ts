// LANE — THE VIDEO HOP (dynamic). Spark ads-project-type, WP3.
//
// What a hosted image-to-video clip must never do without this file noticing:
//
//   · land on a path the store did not mint (id refusal, store round-trip);
//   · be priced as free (the table is total and every cell is null or a real
//     positive number; the gate's hold is never zero);
//   · reach the vendor over the ceiling (the pre-gate refuses with the adapter's
//     call count still at zero, and nothing is written);
//   · collapse a refusal into a failure (distinct terminal states, the vendor's
//     words kept);
//   · walk queued → rendering → done without a playable mp4 at the end.
//
// NO NETWORK, NO KEY, NO MONEY. Every clip runs through a fake adapter handed in
// through `setVideoAdapterForTests`; the one block that drives the REAL Leonardo
// adapter does it against a stubbed global fetch and a resolver that never asks
// DNS, with a placeholder key that is not a credential.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { keepEnv } from "./_helpers";
import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { GET as capabilityGET, POST as clipsPOST } from "@/app/api/video/clips/route";
import { GET as clipGET } from "@/app/api/video/clips/[id]/route";
import { GET as clipFileGET } from "@/app/api/video/clips/[id]/file/route";
import { VIDEO_BUDGET_VAR, __resetVideoBudget, videoBudgetStats } from "@/lib/imaging/video/budget";
import { readClip, setVideoAdapterForTests, startClip } from "@/lib/imaging/video/clips";
import { leonardoVideoAdapter, type VideoAdapter, type VideoOutcome } from "@/lib/imaging/video/leonardo";
import { clipPriceTable, costFromVendor, gateHoldUsd } from "@/lib/imaging/video/pricing";
import {
  clipFileStat,
  clipPath,
  clipRecordPath,
  isClipId,
  listClipRecords,
  mintClipId,
  patchClipRecord,
  readClipRecord,
  writeClipBytes,
  writeClipRecord,
} from "@/lib/imaging/video/store";
import { CLIP_DURATIONS, VIDEO_MODELS, type ClipRecord, type VideoClipRequest } from "@/lib/imaging/video/types";

const SECRET = "probe-video-secret";
/** Four bytes of PNG signature — the adapter is fake, it only has to be base64. */
const IMAGE = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
/** Stand-in mp4 bytes: an ftyp box header and padding. Never decoded here. */
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, ...new Array(52).fill(7)]);

let dir = "";

keepEnv(["CLIP_STORE_DIR", ACCESS_SECRET_VAR, "NEXT_PUBLIC_DEV_AUTH", VIDEO_BUDGET_VAR, "LEONARDO_API_KEY"]);

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "video-clips-"));
  process.env.CLIP_STORE_DIR = dir;
  process.env[ACCESS_SECRET_VAR] = SECRET;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  delete process.env[VIDEO_BUDGET_VAR];
  __resetVideoBudget();
  __resetRateLimit();
});

test.afterEach(() => {
  setVideoAdapterForTests(null);
  rmSync(dir, { recursive: true, force: true });
});

const body = (over: Partial<VideoClipRequest> = {}): VideoClipRequest => ({
  projectId: "pr-probe",
  image: IMAGE,
  mime: "image/png",
  motion: "Slow push-in; steam rises once from the cup.",
  durationS: 5,
  aspect: "9:16",
  model: "kling-2-5",
  ...over,
});

const post = (b: unknown, ip = "10.9.0.1") =>
  clipsPOST(
    new Request("http://localhost/api/video/clips", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}`, "x-forwarded-for": ip },
      body: JSON.stringify(b),
    }),
  );

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${SECRET}`, ...headers } });

/** A fake adapter whose run is held open until the probe releases it, so the
 *  intermediate states can be READ rather than assumed. */
function heldAdapter(outcome: VideoOutcome, cost: number | null = 1.2) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const calls: string[] = [];
  const adapter: VideoAdapter = {
    id: "fake",
    configured: () => true,
    async render(input, onAccepted) {
      calls.push(input.prompt);
      await onAccepted({ vendorJobId: "gen-fake-1", costUsd: cost, costBasis: cost === null ? "unpriced" : "estimated" });
      await gate;
      return outcome;
    },
  };
  return { adapter, calls, release };
}

async function settled(clipId: string): Promise<ClipRecord> {
  for (let i = 0; i < 200; i++) {
    const r = await readClipRecord(clipId);
    if (r && (r.status === "done" || r.status === "failed" || r.status === "refused")) return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error(`clip ${clipId} never settled`);
}

/* ── the store ─────────────────────────────────────────────────────────── */

test("store: a minted id round-trips a record and an mp4; patches serialise", async () => {
  const id = mintClipId();
  expect(isClipId(id), id).toBe(true);
  expect(mintClipId(1)).not.toBe(mintClipId(1)); // randomness, not just the clock

  const rec: ClipRecord = {
    clipId: id,
    projectId: "pr-1",
    status: "queued",
    model: "veo-3",
    durationS: 10,
    aspect: "16:9",
    motion: "slow drift",
    vendorJobId: null,
    costUsd: null,
    costBasis: "unpriced",
    error: null,
    createdAt: 1,
    finishedAt: null,
  };
  await writeClipRecord(rec);
  expect(await readClipRecord(id)).toEqual(rec);
  expect(await readClipRecord(mintClipId())).toBeNull();

  // Two patches issued in one tick both land.
  await Promise.all([
    patchClipRecord(id, (r) => ({ ...r, status: "rendering" })),
    patchClipRecord(id, (r) => ({ ...r, vendorJobId: "gen-9" })),
  ]);
  const both = await readClipRecord(id);
  expect([both?.status, both?.vendorJobId]).toEqual(["rendering", "gen-9"]);

  expect(await clipFileStat(id)).toBeNull();
  const abs = await writeClipBytes(id, MP4);
  expect(abs).toBe(clipPath(id));
  expect((await clipFileStat(id))?.size).toBe(MP4.length);

  const listed = await listClipRecords("pr-1");
  expect(listed.clips.map((c) => c.clipId)).toEqual([id]);
  expect((await listClipRecords("pr-other")).clips).toEqual([]);

  // A corrupt record is not an absent one.
  writeFileSync(clipRecordPath(id), "{ half a rec");
  await expect(readClipRecord(id)).rejects.toThrow(/not a readable clip record/);
  expect((await listClipRecords()).unreadable).toBe(1);
});

test("store: an id the store did not mint names no path", async () => {
  for (const bad of ["../../etc/passwd", "clip-", "clip-ABCDEF", "clip-abc", "x-abcdef", `clip-${"a".repeat(65)}`, 42, null])
    expect(isClipId(bad), String(bad)).toBe(false);
  expect(() => clipPath("../escape")).toThrow(/not a clip id/);
  expect(() => clipRecordPath("clip-../../x")).toThrow(/not a clip id/);

  const r = await clipGET(get("/api/video/clips/x"), { params: Promise.resolve({ id: "..%2F..%2Fsecrets" }) });
  expect(r.status).toBe(404);
  const f = await clipFileGET(get("/api/video/clips/x/file"), { params: Promise.resolve({ id: "../x" }) });
  expect(f.status).toBe(404);
});

/* ── pricing ───────────────────────────────────────────────────────────── */

test("pricing: total over every model × duration; unpriced is null, never 0; the hold is never 0", () => {
  const t = clipPriceTable();
  let cells = 0;
  for (const m of VIDEO_MODELS)
    for (const d of CLIP_DURATIONS) {
      cells++;
      const v = t[m][d];
      expect(v === null || (Number.isFinite(v) && v > 0), `${m}/${d} = ${v}`).toBe(true);
      const hold = gateHoldUsd(m, d);
      expect(Number.isFinite(hold) && hold > 0, `${m}/${d} hold ${hold}`).toBe(true);
    }
  expect(cells).toBe(VIDEO_MODELS.length * CLIP_DURATIONS.length);
  // The table handed out is a copy.
  (t["veo-3"] as Record<number, number | null>)[5] = 999;
  expect(clipPriceTable()["veo-3"][5]).not.toBe(999);

  expect(costFromVendor({ amount: "1000", unit: "CREDITS" })).toEqual({ usd: 2.57, basis: "estimated" });
  expect(costFromVendor({ apiCreditCost: 400 }).basis).toBe("estimated");
  expect(costFromVendor({ amount: 1.5, unit: "USD" })).toEqual({ usd: 1.5, basis: "vendor-reported" });
  expect(costFromVendor({ amount: 3, unit: "GEMS" })).toEqual({ usd: null, basis: "unpriced" });
  expect(costFromVendor({ amount: "" })).toEqual({ usd: null, basis: "unpriced" });
  expect(costFromVendor({ amount: 0, unit: "USD" })).toEqual({ usd: null, basis: "unpriced" });
});

/* ── the route, through the fake adapter ───────────────────────────────── */

test("POST: 202 with a clip id; the record walks queued → rendering → done and the mp4 is served", async () => {
  const held = heldAdapter({ kind: "done", bytes: MP4 });
  setVideoAdapterForTests(held.adapter);

  const res = await post(body());
  expect(res.status).toBe(202);
  const { clipId } = (await res.json()) as { clipId: string };
  expect(isClipId(clipId)).toBe(true);

  // The record exists the moment the 202 does.
  const first = await readClipRecord(clipId);
  expect(["queued", "rendering"]).toContain(first?.status);
  // Held open by the fake: rendering, with the vendor's job id and charge.
  let mid: ClipRecord | null = null;
  for (let i = 0; i < 100 && mid?.vendorJobId !== "gen-fake-1"; i++) {
    await new Promise((r) => setTimeout(r, 5));
    mid = await readClipRecord(clipId);
  }
  expect(mid?.status, mid?.error ?? "").toBe("rendering");
  expect(mid?.vendorJobId).toBe("gen-fake-1");
  expect(mid?.costUsd).toBe(1.2);
  expect(videoBudgetStats().held).toBeGreaterThan(0);
  // The poll route reports the live run as live, not as interrupted.
  const polled = (await (await clipGET(get(`/api/video/clips/${clipId}`), { params: Promise.resolve({ id: clipId }) })).json()) as ClipRecord;
  expect(polled.status).toBe("rendering");

  held.release();
  const done = await settled(clipId);
  expect(done.status).toBe("done");
  expect(done.error).toBeNull();
  expect(done.finishedAt).not.toBeNull();
  expect(held.calls).toEqual([body().motion]);
  // Money: the hold is gone and the vendor's figure is booked as served.
  const s = videoBudgetStats();
  expect(s.held).toBe(0);
  expect(s.spent).toBe(1.2);

  // The file route: whole, then one range (k= rides the query for a <video>).
  const whole = await clipFileGET(new Request(`http://localhost/api/video/clips/${clipId}/file?k=${SECRET}`), {
    params: Promise.resolve({ id: clipId }),
  });
  expect(whole.status).toBe(200);
  expect(whole.headers.get("content-type")).toBe("video/mp4");
  expect(new Uint8Array(await whole.arrayBuffer())).toEqual(MP4);
  const part = await clipFileGET(get(`/api/video/clips/${clipId}/file`, { range: "bytes=4-7" }), {
    params: Promise.resolve({ id: clipId }),
  });
  expect(part.status).toBe(206);
  expect(part.headers.get("content-range")).toBe(`bytes 4-7/${MP4.length}`);
  expect(Buffer.from(await part.arrayBuffer()).toString("latin1")).toBe("ftyp");
  // Without the secret, the file is closed.
  const anon = await clipFileGET(new Request(`http://localhost/api/video/clips/${clipId}/file`), {
    params: Promise.resolve({ id: clipId }),
  });
  expect(anon.status).toBe(401);
  console.log(`[video] done path: ${clipId} queued→rendering→done, ${MP4.length}B served, spent $${s.spent}`);
});

test("failed and refused are distinct terminal states, each with the vendor's words", async () => {
  const failed = heldAdapter({ kind: "failed", message: "Leonardo reported FAILED: upstream worker crashed" });
  setVideoAdapterForTests(failed.adapter);
  const a = await startClip(body());
  failed.release();
  const fr = await a.done;
  expect(fr.status).toBe("failed");
  expect(fr.error).toBe("Leonardo reported FAILED: upstream worker crashed");

  const refused = heldAdapter({ kind: "refused", message: "Image flagged by content moderation: violence." }, null);
  setVideoAdapterForTests(refused.adapter);
  const b = await startClip(body({ model: "veo-3" }));
  refused.release();
  const rr = await b.done;
  expect(rr.status).toBe("refused");
  expect(rr.error).toBe("Image flagged by content moderation: violence.");
  expect(await readClipRecord(b.clipId)).toEqual(rr);
  // The failed one was charged at start and is booked as such; the refused one
  // carried no figure and books nothing — unpriced, counted, not free.
  const s = videoBudgetStats();
  expect(s.held).toBe(0);
  expect(s.counters.bookedFailed).toBe(1);
  expect(s.counters.unpriced).toBe(1);
});

test("an adapter that throws closes the clip as failed and releases nothing it never took", async () => {
  setVideoAdapterForTests({
    id: "fake",
    configured: () => true,
    render: async () => {
      throw new Error("socket hang up");
    },
  });
  const run = await startClip(body());
  const rec = await run.done;
  expect(rec.status).toBe("failed");
  expect(rec.error).toMatch(/socket hang up/);
  expect(videoBudgetStats().held).toBe(0);
  expect(videoBudgetStats().spent).toBe(0);
});

test("a clip left rendering by a process that is gone reads as failed, not rendering forever", async () => {
  const id = mintClipId();
  await writeClipRecord({
    clipId: id, projectId: "pr-1", status: "rendering", model: "hailuo-03", durationS: 5, aspect: "16:9",
    motion: "m", vendorJobId: "gen-7", costUsd: null, costBasis: "unpriced", error: null, createdAt: 1, finishedAt: null,
  });
  const r = await readClip(id);
  expect(r?.status).toBe("failed");
  expect(r?.error).toMatch(/gen-7/);
});

/* ── the pre-gate ──────────────────────────────────────────────────────── */

test("over the ceiling: refused 402 BEFORE the adapter is called, nothing written", async () => {
  const held = heldAdapter({ kind: "done", bytes: MP4 });
  setVideoAdapterForTests(held.adapter);
  process.env[VIDEO_BUDGET_VAR] = "0"; // "spend nothing" — an unpriced clip must still be refused

  const res = await post(body({ durationS: 10 }));
  expect(res.status).toBe(402);
  const b = (await res.json()) as Record<string, string>;
  expect(b.error).toBe("over-budget");
  expect(b.code).toBe("over-budget");
  expect(b.message).toBe(b.detail);
  expect(b.message).toMatch(/Refused before the vendor was called/);
  expect(held.calls).toEqual([]);
  expect((await listClipRecords()).clips).toEqual([]);
  expect(videoBudgetStats().counters.refusals).toBe(1);

  // And a ceiling with room for one hold admits one and refuses the next.
  process.env[VIDEO_BUDGET_VAR] = String(gateHoldUsd("kling-2-5", 5) + 0.01);
  const admitted = await post(body(), "10.9.0.2");
  expect(admitted.status).toBe(202);
  expect((await post(body(), "10.9.0.3")).status).toBe(402);
  held.release();
  const { clipId } = (await admitted.json()) as { clipId: string };
  expect((await settled(clipId)).status).toBe("done");
  expect(held.calls.length).toBe(1);
});

test("no key: the capability says so, and a POST is refused before anything is held", async () => {
  setVideoAdapterForTests({ id: "fake", configured: () => false, render: async () => ({ kind: "done", bytes: MP4 }) });
  const cap = await (await capabilityGET(get("/api/video/clips"))).json();
  expect(cap.configured).toBe(false);
  expect(cap.models).toEqual([]);
  expect(Object.keys(cap.priceUsd).sort()).toEqual([...VIDEO_MODELS].sort());
  const res = await post(body());
  expect(res.status).toBe(503);
  expect(((await res.json()) as Record<string, string>).message).toBe("No video vendor key on this server.");
  expect(videoBudgetStats().held).toBe(0);
});

test("bad bodies are 400 with the field named, before key or budget", async () => {
  setVideoAdapterForTests({ id: "fake", configured: () => false, render: async () => ({ kind: "done", bytes: MP4 }) });
  const cases: [unknown, RegExp][] = [
    [{}, /projectId/],
    [{ ...body(), model: "wan-2-1" }, /model/],
    [{ ...body(), durationS: 7 }, /durationS/],
    [{ ...body(), aspect: "1:1" }, /aspect/],
    [{ ...body(), motion: "  " }, /motion/],
    [{ ...body(), mime: "image/gif" }, /mime/],
  ];
  for (const [b, re] of cases) {
    const res = await post(b);
    expect(res.status, JSON.stringify(b).slice(0, 60)).toBe(400);
    expect(((await res.json()) as Record<string, string>).message).toMatch(re);
  }
});

/* ── the real Leonardo adapter, offline ────────────────────────────────── */

test.describe("leonardo adapter against a scripted vendor (no network)", () => {
  const realFetch = globalThis.fetch;
  const resolve = async () => [{ address: "93.184.216.34" }];
  type Script = (url: string, init?: RequestInit) => Response | undefined;

  function stub(script: Script, seen: string[]) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      seen.push(`${init?.method ?? "GET"} ${url}`);
      const r = script(url, init);
      if (!r) throw new Error(`unscripted fetch ${url}`);
      return r;
    }) as typeof fetch;
  }
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });
  test.beforeEach(() => {
    process.env.LEONARDO_API_KEY = "probe-placeholder-not-a-key";
  });

  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  const common: Script = (url) => {
    if (url.endsWith("/v1/init-image"))
      return json({ uploadInitImage: { id: "img-1", url: "https://uploads.example.test/slot", fields: '{"key":"k1","policy":"p"}' } });
    if (url === "https://uploads.example.test/slot") return new Response(null, { status: 204 });
    return undefined;
  };
  const input = { image: new Uint8Array([1, 2, 3]), mime: "image/png" as const, prompt: "push in", durationS: 5 as const, aspect: "16:9" as const, model: "hailuo-03" as const };
  const opts = { resolve, sleep: async () => undefined, pollMs: 1, maxPolls: 5 };

  test("done: upload → named-model start → poll → download, cost read from the start reply", async () => {
    const seen: string[] = [];
    let polls = 0;
    let startBody: Record<string, unknown> = {};
    stub((url, init) => {
      const c = common(url, init);
      if (c) return c;
      if (url.endsWith("/v2/generations") && init?.method === "POST") {
        startBody = JSON.parse(String(init.body));
        return json({ generate: { generationId: "gen-42", cost: { amount: "500", unit: "CREDITS" } } });
      }
      if (url.endsWith("/v2/generations/gen-42"))
        return ++polls < 2 ? json({ generation: { status: "PENDING" } }) : json({ generation: { status: "COMPLETE", videoUrl: "https://cdn.example.test/out.mp4" } });
      if (url === "https://cdn.example.test/out.mp4") return new Response(MP4, { status: 200 });
      return undefined;
    }, seen);
    const accepted: unknown[] = [];
    const out = await leonardoVideoAdapter(opts).render(input, (a) => void accepted.push(a));
    expect(out.kind).toBe("done");
    expect(out.kind === "done" && out.bytes.length).toBe(MP4.length);
    expect(accepted).toEqual([{ vendorJobId: "gen-42", costUsd: 500 * 0.00257, costBasis: "estimated" }]);
    // The model is NAMED, the vendor may not rewrite the line, the clip is silent.
    expect(startBody.model).toBe("hailuo-03");
    const p = startBody.parameters as Record<string, unknown>;
    expect([p.prompt_enhance, p.audio, p.duration, p.width, p.height]).toEqual(["OFF", false, 5, 856, 480]);
    // Exactly one start POST — never retried.
    expect(seen.filter((s) => s.startsWith("POST") && s.endsWith("/v2/generations")).length).toBe(1);
  });

  test("refused at start: the vendor's moderation words, verbatim, and no retry", async () => {
    const seen: string[] = [];
    stub((url, init) => common(url, init) ?? (url.endsWith("/v2/generations") ? json({ error: "Content moderation: the image was flagged." }, 400) : undefined), seen);
    const out = await leonardoVideoAdapter(opts).render(input, () => undefined);
    expect(out).toEqual({ kind: "refused", message: "Content moderation: the image was flagged." });
    expect(seen.filter((s) => s.endsWith("/v2/generations")).length).toBe(1);
  });

  test("a 5xx start is failed, not refused, and is not retried", async () => {
    const seen: string[] = [];
    stub((url, init) => common(url, init) ?? (url.endsWith("/v2/generations") ? json({ error: "internal" }, 503) : undefined), seen);
    const out = await leonardoVideoAdapter(opts).render(input, () => undefined);
    expect(out.kind).toBe("failed");
    expect(seen.filter((s) => s.endsWith("/v2/generations")).length).toBe(1);
  });

  test("terminal FAILED and NSFW statuses during the poll", async () => {
    for (const [status, kind] of [["FAILED", "failed"], ["NSFW", "refused"]] as const) {
      stub((url, init) => {
        const c = common(url, init);
        if (c) return c;
        if (url.endsWith("/v2/generations")) return json({ generate: { generationId: "gen-9" } });
        if (url.endsWith("/v2/generations/gen-9")) return json({ generation: { status, failureReason: `vendor says ${status}` } });
        return undefined;
      }, []);
      const out = await leonardoVideoAdapter(opts).render(input, () => undefined);
      expect(out.kind, status).toBe(kind);
      expect(out.kind !== "done" && out.message).toMatch(new RegExp(`vendor says ${status}`));
    }
  });
});
