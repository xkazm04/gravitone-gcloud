// LANE — KEYED RECEIPTS (dynamic + source checks).
//
// Acceptance probe for challenge card imaging-service/B (2026-10-10):
// "A paid render outlives its request: keyed receipts that join and replay"
//
// The server always finishes a render it started and bills it, but the HTTP
// response used to be the only place the paid pixels lived. A dropped
// connection, a reload or a laptop sleep during a 60-180 s render left a paid
// image nobody could claim, and the next click paid again.
//
// The invariant pinned here: an identical keyed request (same principal scope,
// same idempotency key, same body) never dispatches or books a second vendor
// call while its first result is held. A miss runs the router, an in-flight hit
// joins it, a settled hit replays it, a body mismatch is a 409, and a failure is
// never retained.
//
// The critic's revision is part of the card: the frames step persists each
// plate job's key on the plate itself, so a reload re-issues with the SAME key
// (case 9), and a source check proves the hook really does it (case 10).

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { keepEnv, stripComments } from "./_helpers";
import { __resetRateLimit } from "@/lib/apiAuth";
import { spendRows, heldUsd, __resetBudget, BUDGET_VAR, WINDOW_VAR, FLOOR_VAR } from "@/lib/imaging/budget";
import {
  withReceipt,
  receiptStats,
  __resetReceipts,
  __setReceiptClock,
  __setReceiptLimits,
} from "@/lib/imaging/receipts";
import { POST as generatePOST } from "@/app/api/imaging/generate/route";
import { generateImage, ImagingRequestError } from "@/lib/imagingClient";
import { pendingReceipt, type Plate } from "@/app/_phases/frames/frames";

const realFetch = globalThis.fetch;

keepEnv([
  BUDGET_VAR,
  WINDOW_VAR,
  FLOOR_VAR,
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "LEONARDO_API_KEY",
  "OLLAMA_HOST",
  "IMAGING_ENV",
  "NEXT_PUBLIC_DEV_AUTH",
]);

const INTERACTIONS = "generativelanguage.googleapis.com";
const KEY_HEADER = "idempotency-key";
const RECEIPT_HEADER = "x-imaging-receipt";

let vendorCalls = 0;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** A distinct image per vendor call, so a replay is provably the ORIGINAL bytes. */
const googleImage = (n: number) =>
  json({ status: "completed", output_image: { data: Buffer.from(`plate-${n}`).toString("base64"), mime_type: "image/png" } });
/** A completed interaction with no image: how a safety block presents. */
const googleRefusal = () => json({ status: "completed" });

/** Vendor stub: every google dispatch is counted and answered by `answer`. */
function stubVendor(answer: (n: number) => Response | Promise<Response>) {
  vendorCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes(INTERACTIONS)) throw new Error(`unexpected fetch ${url}`);
    vendorCalls += 1;
    return answer(vendorCalls);
  }) as typeof fetch;
}

const BODY = { prompt: "a lighthouse at dusk", aspect: "16:9", count: 1 };

function genReq(body: unknown, opts: { key?: string; ip?: string } = {}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": opts.ip ?? "10.0.0.1",
  };
  if (opts.key) headers[KEY_HEADER] = opts.key;
  return new Request("http://localhost/api/imaging/generate", { method: "POST", headers, body: JSON.stringify(body) });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

async function until(cond: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

test.beforeEach(() => {
  __resetBudget();
  __resetReceipts();
  __resetRateLimit();
  delete process.env[BUDGET_VAR];
  delete process.env[WINDOW_VAR];
  delete process.env[FLOOR_VAR];
  delete process.env.OLLAMA_HOST;
  delete process.env.LEONARDO_API_KEY;
  process.env.IMAGING_ENV = "dev";
  process.env.LOCAL_BINARIES = "off"; // agy unavailable: google leads the dev generate chain
  process.env.GOOGLE_AI_API_KEY = "probe-google-key";
  process.env.NEXT_PUBLIC_DEV_AUTH = "1"; // the dev fixture passes the money door
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  __setReceiptClock(null);
  __setReceiptLimits(null);
});

test("1. two concurrent same-key calls -> 1 dispatch, identical images, 1 served row, one hold in flight", async () => {
  const gate = deferred<Response>();
  stubVendor(() => gate.promise);
  const a = generatePOST(genReq(BODY, { key: "k-concurrent" }));
  const b = generatePOST(genReq(BODY, { key: "k-concurrent" }));
  await until(() => vendorCalls === 1);
  // Let the second request reach its join before the owner settles.
  await new Promise((r) => setTimeout(r, 50));
  expect(await heldUsd()).toBeCloseTo(0.045, 6);
  gate.resolve(googleImage(1));
  const [ra, rb] = await Promise.all([a, b]);
  expect(ra.status).toBe(200);
  expect(rb.status).toBe(200);
  const [ja, jb] = await Promise.all([ra.json(), rb.json()]);
  expect(ja.images).toEqual(jb.images);
  expect(vendorCalls).toBe(1);
  expect([ra.headers.get(RECEIPT_HEADER), rb.headers.get(RECEIPT_HEADER)].sort()).toEqual(["fresh", "joined"]);
  const rows = await spendRows();
  expect(rows.map((r) => r.outcome)).toEqual(["served"]);
});

test("2. same key and body after success -> replayed, 0 dispatches, 0 rows, original provenance", async () => {
  stubVendor((n) => googleImage(n));
  const first = await generatePOST(genReq(BODY, { key: "k-replay" }));
  const one = await first.json();
  expect(first.headers.get(RECEIPT_HEADER)).toBe("fresh");
  const rowsBefore = (await spendRows()).length;
  const again = await generatePOST(genReq(BODY, { key: "k-replay" }));
  expect(again.status).toBe(200);
  expect(again.headers.get(RECEIPT_HEADER)).toBe("replayed");
  const two = await again.json();
  expect(vendorCalls).toBe(1);
  expect((await spendRows()).length).toBe(rowsBefore);
  expect(two.images).toEqual(one.images);
  expect(two.provenance).toEqual(one.provenance);
});

test("3. same key, different body -> 409 idempotency-conflict, 0 dispatches, nothing reserved", async () => {
  stubVendor((n) => googleImage(n));
  await generatePOST(genReq(BODY, { key: "k-conflict" }));
  const rowsBefore = (await spendRows()).length;
  const res = await generatePOST(genReq({ ...BODY, prompt: "a different subject" }, { key: "k-conflict" }));
  expect(res.status).toBe(409);
  expect((await res.json()).code).toBe("idempotency-conflict");
  expect(vendorCalls).toBe(1);
  expect(await heldUsd()).toBe(0);
  expect((await spendRows()).length).toBe(rowsBefore);
});

test("4. same key under a different principal scope -> unrelated: dispatches again, never the other's images", async () => {
  stubVendor((n) => googleImage(n));
  const mine = await (await generatePOST(genReq(BODY, { key: "k-shared", ip: "10.0.0.1" }))).json();
  const res = await generatePOST(genReq(BODY, { key: "k-shared", ip: "10.0.0.2" }));
  expect(res.headers.get(RECEIPT_HEADER)).toBe("fresh");
  const theirs = await res.json();
  expect(vendorCalls).toBe(2);
  expect(theirs.images).not.toEqual(mine.images);
});

test("5. an owner that fails -> every joiner gets the same kind; nothing retained, the key dispatches again", async () => {
  // refused, in flight, with a joiner
  const gate = deferred<Response>();
  stubVendor((n) => (n === 1 ? gate.promise : googleImage(n)));
  const a = generatePOST(genReq(BODY, { key: "k-fail" }));
  const b = generatePOST(genReq(BODY, { key: "k-fail" }));
  await until(() => vendorCalls === 1);
  await new Promise((r) => setTimeout(r, 50));
  gate.resolve(googleRefusal());
  const [ra, rb] = await Promise.all([a, b]);
  expect(vendorCalls).toBe(1);
  // Google refused; in dev the router walks the refusal on to vendors with no
  // key here, so the kind that surfaces is the chain's last. Both see the same.
  const [ka, kb] = [(await ra.json()).code, (await rb.json()).code];
  expect(["refused", "no-key"]).toContain(ka);
  expect(kb).toBe(ka);
  expect(rb.status).toBe(ra.status);
  expect(receiptStats().entries).toBe(0);
  const retry = await generatePOST(genReq(BODY, { key: "k-fail" }));
  expect(retry.status).toBe(200);
  expect(vendorCalls).toBe(2);

  // over-budget: a 402 is not retained, so the same key passes once there is room
  process.env[BUDGET_VAR] = "0.01";
  const blocked = await generatePOST(genReq(BODY, { key: "k-402" }));
  expect(blocked.status).toBe(402);
  expect(vendorCalls).toBe(2);
  delete process.env[BUDGET_VAR];
  const passed = await generatePOST(genReq(BODY, { key: "k-402" }));
  expect(passed.status).toBe(200);
  expect(passed.headers.get(RECEIPT_HEADER)).toBe("fresh");
  expect(vendorCalls).toBe(3);
});

test("6. past the TTL, or over the byte cap -> evicted oldest first, the next call runs; retained bytes never exceed the cap", async () => {
  let now = 1_000_000;
  __setReceiptClock(() => now);
  let runs = 0;
  const value = (tag: string) => ({ images: [{ base64: tag.repeat(6), mime: "image/png" }] });
  const run = (tag: string) => async () => {
    runs += 1;
    return value(tag);
  };

  await withReceipt({ scope: "s", key: "ttl", bodyHash: "h" }, run("a"));
  now += 60_000;
  const hit = await withReceipt({ scope: "s", key: "ttl", bodyHash: "h" }, run("a"));
  expect(hit.receipt).toBe("replayed");
  expect(runs).toBe(1);
  now += 15 * 60_000; // past the 15-minute TTL
  const miss = await withReceipt({ scope: "s", key: "ttl", bodyHash: "h" }, run("a"));
  expect(miss.receipt).toBe("fresh");
  expect(runs).toBe(2);

  __resetReceipts();
  __setReceiptLimits({ capBytes: 10 });
  await withReceipt({ scope: "s", key: "one", bodyHash: "h" }, run("a")); // 6 bytes
  now += 1;
  await withReceipt({ scope: "s", key: "two", bodyHash: "h" }, run("b")); // 6 more: "one" must go
  expect(receiptStats().bytes).toBeLessThanOrEqual(10);
  expect(receiptStats().entries).toBe(1);
  const evicted = await withReceipt({ scope: "s", key: "one", bodyHash: "h" }, run("a"));
  expect(evicted.receipt).toBe("fresh");
  expect(runs).toBe(5);
  expect(receiptStats().bytes).toBeLessThanOrEqual(10);
});

/** A browser-side fetch that forwards our own /api/imaging/generate to the real
 *  handler, and the google host to the vendor stub. */
function stubBrowser(opts: { dropFirst?: boolean } = {}) {
  const posts: { key: string | null; body: string; receipt: string | null }[] = [];
  let dropped = false;
  vendorCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes(INTERACTIONS)) {
      vendorCalls += 1;
      return googleImage(vendorCalls);
    }
    if (url === "/api/imaging/generate") {
      const headers = new Headers(init?.headers);
      const body = String(init?.body);
      headers.set("x-forwarded-for", "10.0.0.9");
      const entry = { key: headers.get(KEY_HEADER), body, receipt: null as string | null };
      posts.push(entry);
      const res = await generatePOST(new Request(`http://localhost${url}`, { method: "POST", headers, body }));
      entry.receipt = res.headers.get(RECEIPT_HEADER);
      if (opts.dropFirst && !dropped) {
        // The server finished and billed; the connection died on the way back.
        dropped = true;
        throw new TypeError("Failed to fetch");
      }
      return res;
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return posts;
}

test("7. the client retries a transport failure once with the SAME key and body, and resolves", async () => {
  const posts = stubBrowser({ dropFirst: true });
  const out = await generateImage({ prompt: "a lighthouse at dusk", aspect: "16:9", count: 1 });
  expect(out.images).toHaveLength(1);
  expect(posts).toHaveLength(2);
  expect(posts[0].key).toBeTruthy();
  expect(posts[1].key).toBe(posts[0].key);
  expect(posts[1].body).toBe(posts[0].body);
  expect(posts[1].receipt).toBe("replayed");
  expect(vendorCalls).toBe(1);
  expect(await spendRows()).toHaveLength(1);
});

test("8. [guard] no idempotency-key header -> today's path: dispatched, booked, nothing retained", async () => {
  stubVendor((n) => googleImage(n));
  const a = await generatePOST(genReq(BODY));
  expect(a.status).toBe(200);
  expect(a.headers.get(RECEIPT_HEADER)).toBeNull();
  const b = await generatePOST(genReq(BODY));
  expect(b.status).toBe(200);
  expect(vendorCalls).toBe(2);
  expect(await spendRows()).toHaveLength(2);
  expect(receiptStats().entries).toBe(0);
});

test("9. reload: a persisted plate key re-issued by a fresh client call within the TTL -> replayed, 0 dispatches, 0 rows", async () => {
  const posts = stubBrowser();
  // Before the reload: the plate job's key is minted and stored on the plate.
  const key = "plate-job-7f3a";
  const stored: Plate = { state: "generating", subject: "a lighthouse at dusk", receipt: key };
  await generateImage({ prompt: "a lighthouse at dusk", aspect: "16:9", count: 1 }, { key });
  expect(vendorCalls).toBe(1);
  const rows = (await spendRows()).length;

  // After it: nothing in memory but the stored record.
  const persisted = pendingReceipt(stored);
  expect(persisted).toBe(key);
  const out = await generateImage({ prompt: "a lighthouse at dusk", aspect: "16:9", count: 1 }, { key: persisted });
  expect(out.images).toHaveLength(1);
  expect(posts.at(-1)!.key).toBe(key);
  expect(posts.at(-1)!.receipt).toBe("replayed");
  expect(vendorCalls).toBe(1);
  expect((await spendRows()).length).toBe(rows);

  // A settled plate holds no key: a deliberate re-render is a new paid call.
  expect(pendingReceipt({ state: "ready", receipt: key })).toBeUndefined();
});

test("9b. a coded server failure is not retried by the client (it was billed; a retry would bill again)", async () => {
  vendorCalls = 0;
  let posts = 0;
  globalThis.fetch = (async () => {
    posts += 1;
    return json({ detail: "The imaging call failed.", code: "failed" }, 502);
  }) as typeof fetch;
  await expect(generateImage({ prompt: "x", aspect: "16:9" })).rejects.toBeInstanceOf(ImagingRequestError);
  expect(posts).toBe(1);
});

test("10. wiring: the routes run through the receipt seam; the client sends the key; the frames hook persists and reuses it", () => {
  const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"));
  // The handler bodies (and so the receipt seam call) live in lib/imaging/handlers.ts;
  // each route.ts must still delegate to its handler after its auth door.
  const handlers = read("lib/imaging/handlers.ts");
  expect(handlers).toMatch(/respondKeyed\(req, "generate"/);
  expect(handlers).toMatch(/respondKeyed\(req, "edit"/);
  for (const [route, fn] of [["generate", "generateHandler"], ["edit", "editHandler"]])
    expect(read(`app/api/imaging/${route}/route.ts`), route).toMatch(new RegExp(`\\b${fn}\\(req\\)`));
  expect(read("lib/imaging/api.ts")).toMatch(/withReceipt\(/);
  const client = read("lib/imagingClient.ts");
  expect(client).toMatch(/"idempotency-key"/);
  expect(client).toMatch(/randomUUID/);
  const frames = read("app/_phases/frames/useFrames.ts");
  // the key is read back from the stored plate, persisted on the generating
  // plate, and handed to the client
  expect(frames).toMatch(/pendingReceipt\(frame\.plate\)/);
  expect(frames).toMatch(/state:\s*"generating",\s*subject,\s*receipt/);
  expect(frames).toMatch(/generateImage\([\s\S]*?\{\s*key\s*\}\s*\)/);
});
