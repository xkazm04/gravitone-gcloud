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
//
// RETIRED WITH THE v1 STUDIO (Phase 4 wave D): the composition-hook cases (3 a reload
// lands the poster once, 4 a cancel still lands it, 7 a second poster keeps the seed)
// drove useMusicVideoComposition over IndexedDB. The album's still is a part act now: a
// kernel job that books every take on the job and adopts a live job on a second confirm
// (tests/next-server/producer-step-still.test.ts). The route cases stay.

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as startPOST, GET as listGET } from "@/app/api/turns/route";
import { GET as turnGET } from "@/app/api/turns/[id]/route";
import { POST as cancelPOST } from "@/app/api/turns/[id]/cancel/route";
import { GET as spendGET } from "@/app/api/spend/route";
import { BUDGET_VAR, WINDOW_VAR, __resetBudget, spendRows } from "@/lib/imaging/budget";
import { __resetTextSpend, textSpendRows } from "@/lib/text/spend";
import { digestOf, type TurnRecord } from "@/lib/turns/ledger";
import { whenIdle } from "@/lib/turns/runner";

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
  vendor.bodies.length = 0;
  vendor.gate = null;
});
test.afterEach(async () => {
  vendor.gate?.release();
  await whenIdle();
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
async function turn(id: string): Promise<TurnRecord> {
  const res = await turnGET(new Request(`http://localhost/api/turns/${id}`, { headers: headers() }), { params: Promise.resolve({ id }) });
  return ((await res.json()) as { turn: TurnRecord }).turn;
}
const untilSettled = async (id: string): Promise<TurnRecord> => {
  await eventually(`turn ${id} settled`, async () => !["accepted", "running"].includes((await turn(id)).status));
  return turn(id);
};


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

/* ── 4: cancel ────────────────────────────────────────────────────────────── */

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
