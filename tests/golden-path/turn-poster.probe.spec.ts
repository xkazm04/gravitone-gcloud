// LANE — THE POSTER IS A SERVER WORK KIND, AND A RELOAD KEEPS WHAT IT PAID FOR (dynamic, AIO-A tail).
//
// WHAT WAS WRONG. The music-video poster was a client-driven job: the browser
// called /api/imaging/generate and held the image in a closure. A reload rewrote
// the job `interrupted`, the server went on generating, and the paid image was
// billed and thrown away because its only consumer was the dead closure.
//
// WHAT THIS PROBE DRIVES. The real exported route handlers behind a stand-in
// `fetch` (the browser's relative /api/ calls go to them), the REAL runner, the
// REAL imaging router with its vendor `fetch` stubbed (no live call, no agy:
// LOCAL_BINARIES is off), the real composition hook over a real IndexedDB engine
// (`fake-indexeddb`), and the record store the landing patches.
//
// OPERATOR DECISION T1 ("keep what is paid for"): the poster is a work kind with
// `cancellable: false`.
import "./_c1-harness";

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as startPOST, GET as listGET } from "@/app/api/turns/route";
import { GET as turnGET } from "@/app/api/turns/[id]/route";
import { POST as cancelPOST } from "@/app/api/turns/[id]/cancel/route";
import { GET as spendGET } from "@/app/api/spend/route";
import { __forgetPoster } from "@/app/_phases/frames/music-video/posterLive";
import { useMusicVideoComposition } from "@/app/_phases/frames/music-video/useMusicVideoComposition";
import { patchRecord } from "@/app/_phases/_shared/records/patch";
import { __resetSaveSlots, type MusicVideoSourceStepData } from "@/app/_phases/_shared/stepStore";
import { MUSIC_VIDEO_SOURCE } from "@/app/_phases/research/records";
import { BUDGET_VAR, WINDOW_VAR, __resetBudget, spendRows } from "@/lib/imaging/budget";
import { __resetTextSpend, textSpendRows } from "@/lib/text/spend";
import { digestOf, type TurnRecord } from "@/lib/turns/ledger";
import { whenIdle } from "@/lib/turns/runner";
import type { useJobs } from "@/lib/jobs";
import { getRecord, openDb, STEPS_STORE, UPLOADS_STORE } from "@/lib/studioDb";

import { harness } from "./_c1-harness";
import { keepEnv } from "./_helpers";

keepEnv([
  "TEXT_TURN_DIR",
  "NEXT_PUBLIC_DEV_AUTH",
  "NEXT_PUBLIC_IMAGING_ACCESS_SECRET",
  "SPEND_STORE",
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "OLLAMA_HOST",
  BUDGET_VAR,
  WINDOW_VAR,
]);

const SECRET = "probe-turn-poster-secret";
const STYLE = "neon dusk over a flooded motorway";
/** Things about the track that must never reach the vendor. */
const TRACK = { title: "Midnight Anthem", artist: "Famous Artist", fileName: "Famous Artist - Midnight Anthem (final).mp3" };

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-turn-poster-"));
  process.env.TEXT_TURN_DIR = dir;
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
  process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET = SECRET;
  process.env.SPEND_STORE = "memory";
  process.env.LOCAL_BINARIES = "off";
  process.env.GOOGLE_AI_API_KEY = "probe-google-key";
  delete process.env.OLLAMA_HOST;
  delete process.env[BUDGET_VAR];
  delete process.env[WINDOW_VAR];
  __resetBudget();
  __resetTextSpend();
  __resetSaveSlots();
  __forgetPoster();
  vendor.bodies.length = 0;
  vendor.gate = null;
});
test.afterEach(async () => {
  vendor.gate?.release();
  await whenIdle();
  __forgetPoster();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

/* ── the vendor, and the browser's fetch ──────────────────────────────────── */

const vendor: { bodies: string[]; gate: { release: () => void; hold: Promise<void> } | null } = { bodies: [], gate: null };
const holdVendor = () => {
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  vendor.gate = { release, hold };
  return vendor.gate;
};

let ip = 0;
async function route(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!raw.startsWith("/api/")) {
    // The vendor. Every call is counted by its body; an image comes back.
    vendor.bodies.push(typeof init?.body === "string" ? init.body : "");
    if (vendor.gate) await vendor.gate.hold;
    return new Response(JSON.stringify({ status: "completed", output_image: { data: PNG_B64, mime_type: "image/png" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  const url = new URL(raw, "http://localhost");
  const headers = new Headers(init?.headers);
  headers.set("x-forwarded-for", `10.96.0.${(++ip % 250) + 1}`);
  const method = (init?.method ?? "GET").toUpperCase();
  const req = new Request(url, { method, headers, body: init?.body ?? undefined });
  const p = url.pathname;
  let m: RegExpMatchArray | null;
  if (p === "/api/turns" && method === "POST") return startPOST(req);
  if (p === "/api/turns" && method === "GET") return listGET(req);
  if ((m = p.match(/^\/api\/turns\/([^/]+)\/cancel$/)) && method === "POST")
    return cancelPOST(req, { params: Promise.resolve({ id: decodeURIComponent(m[1]!) }) });
  if ((m = p.match(/^\/api\/turns\/([^/]+)$/)) && method === "GET")
    return turnGET(req, { params: Promise.resolve({ id: decodeURIComponent(m[1]!) }) });
  throw new Error(`no handler for ${method} ${p}`);
}

/** Three bytes; the vendor's base64 for them. */
const PNG_B64 = "AQID";

const realFetch = globalThis.fetch;
test.beforeEach(() => {
  globalThis.fetch = route as typeof fetch;
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function eventually(what: string, ok: () => boolean | Promise<boolean>, ms = 20_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ok()) return;
    await wait(25);
  }
  throw new Error(`never: ${what}`);
}

const headers = () => ({ "content-type": "application/json", "x-forwarded-for": `10.96.1.${(++ip % 250) + 1}`, authorization: `Bearer ${SECRET}` });

async function post(projectId: string, input: unknown) {
  const res = await startPOST(
    new Request("http://localhost/api/turns", { method: "POST", headers: headers(), body: JSON.stringify({ kind: "poster-generate", projectId, input }) }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function cancel(id: string) {
  const res = await cancelPOST(new Request(`http://localhost/api/turns/${id}/cancel`, { method: "POST", headers: headers() }), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function turn(id: string): Promise<TurnRecord> {
  const res = await turnGET(new Request(`http://localhost/api/turns/${id}`, { headers: headers() }), { params: Promise.resolve({ id }) });
  return ((await res.json()) as { turn: TurnRecord }).turn;
}
const untilSettled = async (id: string): Promise<TurnRecord> => {
  await eventually(`turn ${id} settled`, async () => !["accepted", "running"].includes((await turn(id)).status));
  return turn(id);
};

/** The track's record, as Research leaves it - with everything about the track
 *  a prompt must never carry. */
async function seedSource(projectId: string, extra: Partial<MusicVideoSourceStepData> = {}) {
  const out = await patchRecord(MUSIC_VIDEO_SOURCE, projectId, () => ({
    sourceAssetId: "asset-track",
    style: STYLE,
    envelope: { durationS: 3, hopS: 0.5, rms: [0.1, 0.2], onsets: [] } as unknown as MusicVideoSourceStepData["envelope"],
    ...TRACK,
    ...extra,
  }) as MusicVideoSourceStepData);
  expect(out.ok, "the source record was not written").toBe(true);
}
async function sourceOf(projectId: string) {
  const db = await openDb();
  try {
    return (await getRecord<{ data: MusicVideoSourceStepData }>(db, STEPS_STORE, `${projectId}:music-video-source`))?.data;
  } finally {
    db.close();
  }
}

/** Counts every put into the uploads store and every put of a source record that
 *  carries a poster. Installed once per file. */
const puts = { uploads: 0, posterPatches: 0 };
const realPut = IDBObjectStore.prototype.put;
test.beforeAll(() => {
  IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    if (this.name === UPLOADS_STORE) puts.uploads++;
    if (this.name === STEPS_STORE && value && typeof value === "object" && (value as { data?: { posterAssetId?: string } }).data?.posterAssetId) puts.posterPatches++;
    return realPut.call(this, value, key);
  };
});
test.afterAll(() => {
  IDBObjectStore.prototype.put = realPut;
});
test.beforeEach(() => {
  puts.uploads = 0;
  puts.posterPatches = 0;
});

const tracked: { turnId: string; kind: string }[] = [];
const jobs = {
  start: () => {
    throw new Error("the poster must not start a localStorage job");
  },
  settle: () => undefined,
  track: (t: { turnId: string; kind: string }) => void tracked.push(t),
} as unknown as ReturnType<typeof useJobs>;
test.beforeEach(() => {
  tracked.length = 0;
});

/* ── 1: the route ─────────────────────────────────────────────────────────── */

test("1: POST /api/turns poster-generate answers 202 and settles done with an imaging receipt", async () => {
  const out = await post("p-pt-1", { style: STYLE });
  console.log(`[turn-poster] start -> ${out.status} ${JSON.stringify(out.json)}`);
  expect(out.status).toBe(202);
  expect(out.json.turnId).toMatch(/^tn-[0-9a-f]{12}$/);

  const rec = await untilSettled(out.json.turnId as string);
  expect(rec.status).toBe("done");
  expect(rec.turn).toBe("image-generate");
  expect(rec.uncancellable).toBe(true);
  const receipt = rec.receipt as { lane?: string; provenance?: { provider: string; costUsd?: number } };
  expect(receipt.lane).toBe("imaging");
  expect(receipt.provenance?.provider).toBe("google");
  expect(rec.result).toEqual({ base64: PNG_B64, mime: "image/png", provider: "google" });

  const file = readdirSync(dir).find((f) => f.endsWith(".json"))!;
  console.log(`[turn-poster] one poster record is ${statSync(join(dir, file)).size} bytes for a ${Buffer.from(PNG_B64, "base64").length}-byte image`);

  // Input the kind cannot serve: nothing is written. (Imported only now: the
  // route must register the kind on its own, not this file.)
  const { MAX_STYLE_CHARS } = await import("@/lib/turns/kinds/poster");
  const before = readdirSync(dir).length;
  expect((await post("p-pt-1b", { style: 12 })).status).toBe(400);
  expect((await post("p-pt-1b", { style: "x".repeat(MAX_STYLE_CHARS + 1) })).status).toBe(400);
  expect(readdirSync(dir).length, "a refused request wrote a record").toBe(before);
});

/* ── 2: the rights rule ───────────────────────────────────────────────────── */

test("2: the vendor sees the style line and nothing of the track; the record holds the digest, never the prompt", async () => {
  // A client that tries to smuggle the track in gets nowhere: the kind reads `style` only.
  const out = await post("p-pt-2", { style: STYLE, ...TRACK, trackName: TRACK.fileName });
  const rec = await untilSettled(out.json.turnId as string);
  expect(rec.status).toBe("done");

  expect(vendor.bodies).toHaveLength(1);
  const sent = vendor.bodies[0]!;
  expect(sent, "the style line did not reach the vendor").toContain(STYLE);
  for (const leak of [TRACK.title, TRACK.artist, TRACK.fileName, "Famous", "Anthem", ".mp3"])
    expect(sent, `the vendor was sent "${leak}"`).not.toContain(leak);

  const { posterPrompt } = await import("@/lib/turns/kinds/poster");
  expect(rec.promptDigest).toBe(digestOf(posterPrompt(STYLE)));
  expect(rec.promptChars).toBe(posterPrompt(STYLE).length);
  const onDisk = readFileSync(join(dir, `${rec.id}.json`), "utf8");
  expect(onDisk, "the prompt is on disk").not.toContain("Visual direction");
  expect(onDisk).not.toContain(STYLE);
  expect(onDisk).not.toContain(TRACK.title);
});

/* ── 3: a reload ──────────────────────────────────────────────────────────── */

test("3: unmount after the start, let the turn settle, resume twice - the poster lands exactly once", async () => {
  const P = "p-pt-3";
  await seedSource(P);
  const gate = holdVendor();

  const h = harness(() => useMusicVideoComposition(P, "u1", jobs));
  await h.settleUp();
  expect(h.current.hydrated).toBe(true);
  h.current.setStyle(STYLE);
  await h.settleUp();
  await h.current.generatePoster();
  await h.settleUp();
  expect(h.current.status).toBe("generating");
  expect(tracked.map((t) => t.kind), "the bell was not given the turn").toEqual(["poster-generate"]);
  const turnId = tracked[0]!.turnId;

  // THE RELOAD: the tab and everything the module held are gone; the ledger and
  // the record store are not.
  h.unmount();
  __forgetPoster();
  gate.release();
  expect((await untilSettled(turnId)).status, "the paid image did not survive the reload").toBe("done");
  expect(puts.uploads, "the image landed with nobody watching").toBe(0);

  // First remount lands it; the second finds it taken - twice over, once with
  // the module's memory gone as well, so only the record can say it was taken.
  const r1 = harness(() => useMusicVideoComposition(P, "u1", jobs));
  await r1.settleUp();
  await eventually("the remount landed the poster", () => puts.posterPatches > 0);
  await r1.settleUp();
  expect(r1.current.posterAssetId).toMatch(/^as-up-/);
  r1.unmount();

  __forgetPoster();
  const r2 = harness(() => useMusicVideoComposition(P, "u1", jobs));
  await r2.settleUp();
  await wait(700);
  await r2.settleUp();
  expect(r2.current.posterAssetId, "the second mount sees the landed poster").toBe(r1.current.posterAssetId);
  r2.unmount();

  expect(puts.uploads, "one upload").toBe(1);
  expect(puts.posterPatches, "one patch").toBe(1);
  expect((await sourceOf(P))?.posterTurn).toBe(turnId);
  expect(vendor.bodies, "one vendor call").toHaveLength(1);
});

/* ── 4: cancel ────────────────────────────────────────────────────────────── */

test("4: a cancel answers not-cancellable, the record keeps running, and the image still lands", async () => {
  const P = "p-pt-4";
  await seedSource(P);
  const gate = holdVendor();
  const out = await post(P, { style: STYLE });
  const id = out.json.turnId as string;
  await eventually("the vendor call is in flight", () => vendor.bodies.length === 1);

  const c = await cancel(id);
  console.log(`[turn-poster] cancel -> ${c.status} ${JSON.stringify({ code: c.json.code })}`);
  expect(c.status).toBe(409);
  expect(c.json.code).toBe("not-cancellable");
  expect((await turn(id)).status, "a cancel was written over a vendor call still billing").toBe("running");

  gate.release();
  expect((await untilSettled(id)).status).toBe("done");

  const h = harness(() => useMusicVideoComposition(P, "u1", jobs));
  await h.settleUp();
  await eventually("the image landed", () => puts.posterPatches > 0);
  await h.settleUp();
  expect(h.current.posterAssetId).toMatch(/^as-up-/);
  h.unmount();
});

/* ── 5: one live poster per project ───────────────────────────────────────── */

test("5: a second poster start for the same project while one is live answers 409 naming it", async () => {
  const gate = holdVendor();
  const first = await post("p-pt-5", { style: STYLE });
  expect(first.status).toBe(202);
  const second = await post("p-pt-5", { style: "something else" });
  console.log(`[turn-poster] second -> ${second.status} ${JSON.stringify(second.json)}`);
  expect(second.status).toBe(409);
  expect(second.json.holder).toBe(first.json.turnId);
  expect((await post("p-pt-5-other", { style: STYLE })).status, "another project is its own slot").toBe(202);
  gate.release();
  await untilSettled(first.json.turnId as string);
});

/* ── 6: the money ─────────────────────────────────────────────────────────── */

test("6: the imaging meter books exactly one served row for the poster, and the text meter none", async () => {
  const out = await post("p-pt-6", { style: STYLE });
  expect((await untilSettled(out.json.turnId as string)).status).toBe("done");

  const rows = await spendRows();
  console.log(`[turn-poster] imaging rows: ${JSON.stringify(rows.map((r) => ({ outcome: r.outcome, basis: r.basis })))}`);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.outcome).toBe("served");
  expect(await textSpendRows(), "a work kind books no text spend row").toEqual([]);

  const view = (await (await spendGET(new Request("http://localhost/api/spend", { headers: headers() }))).json()) as {
    classes: { id: string; rows: number }[];
  };
  expect(view.classes.find((c) => c.id === "imaging-usd")?.rows).toBe(1);
  expect(view.classes.find((c) => c.id === "text-usd")?.rows).toBe(0);
});

/* ── 7: the seed ──────────────────────────────────────────────────────────── */

test("7: a second poster keeps the first poster's seed and effect parameters", async () => {
  const P = "p-pt-7";
  await seedSource(P);
  const h = harness(() => useMusicVideoComposition(P, "u1", jobs));
  await h.settleUp();

  const land = async (n: number) => {
    await h.current.generatePoster();
    await eventually(`poster ${n} landed`, () => puts.posterPatches >= n, 30_000);
    await h.settleUp();
  };
  await land(1);
  const first = await sourceOf(P);
  expect(first?.seed, "no seed was set on the first poster").toBeGreaterThanOrEqual(0);
  expect(first?.effectParams).toBeTruthy();

  await land(2);
  const second = await sourceOf(P);
  expect(second?.posterAssetId, "the second poster did not replace the first").not.toBe(first?.posterAssetId);
  expect(second?.seed, "the seed moved on a re-generated poster").toBe(first?.seed);
  expect(second?.effectParams).toEqual(first?.effectParams);
  expect(second?.envelope, "the landing dropped the envelope").toBeTruthy();
  expect(h.current.seed).toBe(first?.seed);
  h.unmount();
});
