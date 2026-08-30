// INTEGRATION PROBE for lib/imaging — TWO HALVES, and only one of them spends.
//
// Run:  npx tsx pipeline/integration-imaging.mts                the OFFLINE half. Free. The default.
//       npx tsx pipeline/integration-imaging.mts --live         the LIVE half. REAL VENDORS, REAL MONEY.
//       npx tsx pipeline/integration-imaging.mts --live --only leonardo
//       npx tsx pipeline/integration-imaging.mts --live --out ./somewhere
//
// Shaped like gate-regression.mts: OK/FAIL/SKIP per case, a count at the end,
// non-zero exit if anything failed. Written when there was no test framework in
// this repo and it was not this file's place to introduce one — the offline half
// below closed a real coverage hole WITHIN that constraint, and added no
// dependency.
//
// THAT CONSTRAINT IS GONE: @playwright/test now runs `tests/golden-path/` and
// `npm test` is inside `npm run verify`. This script stays as a script anyway,
// on its own merits — the LIVE half spends real money at real vendors, which is
// the one thing that must never be reachable from a suite somebody runs by
// habit. The line is the billing, not the framework. (cards.ts used to cite the
// old sentence here as authority for leaving the notebook graph untested; it no
// longer does.)
//
// ── WHY THERE ARE TWO HALVES ───────────────────────────────────────────────
//
// Until this file grew a second half the live half was the only half, and that
// had two consequences. A run with no API keys reported **"0 failed"** while
// exercising nothing — every case skipped cleanly, and a green result that
// proves nothing is worse than a red one, because it is the report you would
// trust. And it bypassed the HTTP seam entirely: it calls the provider objects
// and the router directly, so app/api/imaging/*/route.ts and api.ts's
// validation layer — the code every real caller actually reaches — had no
// coverage at all.
//
// The OFFLINE half closes both for nothing. It replaces `globalThis.fetch`
// before a line of the engine is loaded and THROWS on any request it was not
// told to expect, then drives the real route handlers over canned vendor wire
// bodies with placeholder keys. The real adapters parse the real shapes, the
// real router does the real routing, no vendor is reached and nobody is billed.
// Any request that did try to leave is recorded and fails the run on its own.
// The technique is wave 2's (f97fff1, 7fccb4a), which proved it and then left
// it behind in a scratchpad.
//
// THE TWO HALVES DO NOT SHARE A PROCESS, deliberately. The offline half
// replaces fetch and installs placeholder keys; a live half running after it
// would be one restore-bug away from either testing nothing or billing a vendor
// while claiming to be offline. One flag, one half, nothing to restore.
//
// ── the live half ──────────────────────────────────────────────────────────
//
// It costs real credits, so it generates the minimum that proves the path: one
// plate, one look at it, one edit of it. The checks are the ones that actually
// bite —
//   · did the image come back at the ASPECT we asked for (the silent 9:16 bug)
//   · did Leonardo's generation get DELETED afterwards (studio cleanliness)
//   · did recognition return JSON that SATISFIES the schema, not just prose
//   · does a refusal surface as `refused` rather than a generic failure
//
// Images are written to disk so a human can look at what the probe judged.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

/* ── .env.local, by hand ──────────────────────────────────────────────────── */
// Next.js loads it; a standalone tsx process does not, and adding dotenv for
// eight lines would be the wrong trade.
function loadEnv(file = ".env.local") {
  const p = path.join(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

/* ── which half ───────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
/** The live half hits real vendors and costs real money, so it is opt-in. */
const LIVE = argv.includes("--live");
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const outDir = argv.includes("--out")
  ? argv[argv.indexOf("--out") + 1]
  : path.join(process.cwd(), "imaging-probe-out");

/* ── the seal: no request may leave an offline run ────────────────────────── */
//
// A canned vendor, or nothing. `null` means "I was not told to expect this",
// which is not a miss to shrug at — it is a request that would have gone to a
// real host, and the whole claim of the offline half is that none do. So it is
// recorded AND thrown, because the throw alone would be swallowed by http.ts
// into an ordinary `failed` error and a negative case could pass on it.

type Wire = (method: string, url: URL, init: RequestInit | undefined) => Response | null;

let wire: Wire | null = null;
/** Every request that tried to leave. Non-empty fails the run, whatever the
 *  individual cases said. */
const escaped: string[] = [];

function sealNetwork(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const url = new URL(href);
    const served = wire?.(method, url, init) ?? null;
    if (served) return served;
    escaped.push(`${method} ${url.host}${url.pathname}`);
    throw new Error(
      `OFFLINE PROBE: a request tried to leave the process — ${method} ${url.host}${url.pathname}`,
    );
  }) as typeof globalThis.fetch;
}

const jsonWire = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// BEFORE the engine is imported, both of these. The fetch replacement because
// that is the point; the env deletions because the adapters read these at
// MODULE LOAD, and an operator with GOOGLE_IMAGE_SIZE=2K in .env.local would
// otherwise watch the priced cases turn unpriced and read it as a regression.
// An offline run must mean the same thing on every machine.
if (!LIVE) {
  sealNetwork();
  for (const v of ["GOOGLE_IMAGE_MODEL", "GOOGLE_VISION_MODEL", "GOOGLE_IMAGE_SIZE", "QWEN_BASE_URL"])
    delete process.env[v];
}

const { ImagingError } = await import("../lib/imaging/errors");
const { KEY_VAR, isConfigured, currentEnv } = await import("../lib/imaging/env");
const { planFor } = await import("../lib/imaging/router");
const { leonardoProvider } = await import("../lib/imaging/providers/leonardo");
const { googleProvider } = await import("../lib/imaging/providers/google");
const { qwenProvider } = await import("../lib/imaging/providers/qwen");
type ImageRef = import("../lib/imaging/types").ImageRef;

/* ── harness ──────────────────────────────────────────────────────────────── */

let passed = 0;
let failed = 0;
let skipped = 0;

/** A skip is thrown, not returned. Returning it once made every skipped case
 *  also print OK — a probe that reports a pass it never ran is worse than no
 *  probe, because it is the report you would trust. */
class Skipped extends Error {}
// The annotation is on the CONST, not just the arrow: TypeScript only narrows
// control flow through a never-returning call when the variable itself is
// explicitly typed. Without it, `if (!plate) skip(...)` fails to narrow `plate`.
const skip: (why: string) => never = (why) => {
  throw new Skipped(why);
};

async function check(name: string, fn: () => Promise<string | void>) {
  if (only && !name.startsWith(only)) return;
  try {
    const note = await fn();
    passed++;
    console.log(`OK    ${name}${note ? ` · ${note}` : ""}`);
  } catch (e) {
    if (e instanceof Skipped) {
      skipped++;
      console.log(`SKIP  ${name} · ${e.message}`);
      return;
    }
    failed++;
    console.log(
      `FAIL  ${name}\n         → ${e instanceof ImagingError ? `[${e.kind}] ${e.message}` : String(e)}`,
    );
  }
}

function save(name: string, img: ImageRef): string {
  mkdirSync(outDir, { recursive: true });
  const ext = img.mime.split("/")[1].replace("jpeg", "jpg");
  const p = path.join(outDir, `${name}.${ext}`);
  writeFileSync(p, Buffer.from(img.base64, "base64"));
  return p;
}

const kb = (img: ImageRef) => Math.round((img.base64.length * 3) / 4 / 1024);

/**
 * The summary, and the reason there is a function for four lines of output.
 *
 * A count on its own is the failure this file was rewritten to remove: "0
 * failed" is true of a run that verified everything and equally true of a run
 * that verified nothing. So every summary names BOTH halves — the one that ran
 * with its counts, the one that did not with why — and says outright when
 * nothing has been put in front of a real vendor. There is no phrasing of this
 * report that reads as "everything passed" when it did not.
 */
function report(half: "offline" | "live"): never {
  const counts = `${passed} passed · ${failed} failed · ${skipped} skipped`;
  const lines =
    half === "offline"
      ? [
          ``,
          `offline · ${counts}`,
          `live    · NOT RUN — pass --live to reach the real vendors (it spends real money)`,
          ``,
          `NOTHING HERE WAS VERIFIED AGAINST A REAL VENDOR.`,
        ]
      : [
          ``,
          `offline · not run in this process — it is the default run, and it is free`,
          `live    · ${counts}`,
          ...(passed === 0
            ? [
                ``,
                `NOTHING WAS VERIFIED AGAINST A REAL VENDOR${skipped ? " — every case skipped for want of a key" : ""}.`,
              ]
            : []),
        ];
  if (failed) lines.push(``, `${half.toUpperCase()} FAILURE — see the FAIL lines above.`);
  console.log(lines.join("\n"));
  process.exit(failed ? 1 : 0);
}

/** Width/height of a PNG or JPEG, read from the header. Enough to prove the
 *  aspect contract held without pulling in an image library. */
function dimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG")
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/* ── the probe prompt (a trimmed pipeline/FRAMES-PROMPT.md) ───────────────── */

const STYLE =
  "Flat vector editorial infographic. Deep ink navy (#0B1B2B) ground; warm paper cream (#F5EFE0) objects; " +
  "bright cyan (#67E8F9) only on the arrows. Matte, hairline strokes, generous empty space. " +
  "No gradients, no shading, no photographic texture, no 3D.";
const SUBJECT =
  "Subject: a simple two-pan balance scale, centred; a tall plain office tower on the left pan, a single " +
  "oversized plain coin on the right pan, the tower's pan riding higher. Large simple shapes. " +
  "The bottom fifth of the frame is empty background.";
const NEGATIVE = "text, letters, numbers, watermark, logo, photorealistic, 3D render, gradient, clutter";

/** The recognition schema IS the probe rubric's first three checks — text
 *  leakage, palette obedience, flatness. Testing the integration and testing
 *  the use case are the same act. */
const PLATE_SCHEMA = {
  type: "object",
  required: ["hasText", "isFlat", "dominantColors"],
  properties: {
    hasText: { type: "boolean", description: "any letters, numbers or glyph-like marks" },
    isFlat: { type: "boolean", description: "flat vector, no gradients or 3D shading" },
    dominantColors: { type: "array", items: { type: "string" }, description: "plain colour names" },
  },
} as const;

/* ══ THE OFFLINE HALF ═══════════════════════════════════════════════════════ */
//
// Everything below runs with `fetch` sealed (see the top of this file), so the
// only vendor that exists is the one each case hands to `wire`. What is being
// tested here is the SEAM: a real `Request` into the real route handler, through
// api.ts's validation, through the router, into the real adapter, which parses
// a canned wire body — and back out as the JSON a browser would receive.
//
// Everything in this half is an assertion about behaviour we control. There is
// no vendor to be flaky, so a FAIL here is a regression, never weather.

if (!LIVE) {
  console.log(`\nimaging OFFLINE probe · fetch is sealed · no vendor is reachable · nothing is billed\n`);

  const { POST: generateRoute } = await import("../app/api/imaging/generate/route");
  const { POST: editRoute } = await import("../app/api/imaging/edit/route");
  const { POST: recognizeRoute } = await import("../app/api/imaging/recognize/route");
  const { GET: pricingRoute } = await import("../app/api/imaging/pricing/route");

  /** A 1×1 PNG. Nothing decodes it — it only has to survive the base64 round
   *  trip so a case can prove the bytes that came out are the bytes that went
   *  in, rather than something the adapter invented. */
  const PIXEL =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
  const IMG = { base64: PIXEL, mime: "image/png" };

  /** Placeholder keys: long enough that log.ts's scrubber treats them as live
   *  secrets, and unmistakably not real if one ever shows up in output. */
  const FAKE = {
    google: "offline-probe-google-key-0000",
    leonardo: "offline-probe-leonardo-key-000",
    qwen: "offline-probe-qwen-key-00000",
  } as const;

  type Vendor = keyof typeof FAKE;
  const ALL: Vendor[] = ["google", "leonardo", "qwen"];

  /** Exactly these vendors are configured, and no others. Written per case,
   *  because "which keys exist" is half of what the router decides on. */
  const useKeys = (...ids: Vendor[]) => {
    for (const id of ALL)
      if (ids.includes(id)) process.env[KEY_VAR[id]] = FAKE[id];
      else delete process.env[KEY_VAR[id]];
  };

  const GOOGLE_HOST = "generativelanguage.googleapis.com";
  const LEONARDO_HOST = "cloud.leonardo.ai";
  const QWEN_HOST = "dashscope-intl.aliyuncs.com";

  /* The Interactions shapes, as providers/google.ts expects to find them. */
  const googleImage = () =>
    jsonWire({
      status: "completed",
      steps: [{ type: "message", content: [{ type: "image", mime_type: "image/png", data: PIXEL }] }],
    });
  const googleText = (text: string) => jsonWire({ status: "completed", output_text: text });
  const googleRefusal = () =>
    jsonWire({ status: "failed", error: { message: "Blocked by the safety policy." } });

  const routes = { generate: generateRoute, edit: editRoute, recognize: recognizeRoute };

  /** A real POST at a real route handler. They are plain functions over a
   *  `Request`, which is the whole reason this half is possible without a
   *  server, and without a framework to host one. */
  const call = (path: keyof typeof routes, body: unknown): Promise<Response> =>
    routes[path](
      new Request(`http://probe.invalid/api/imaging/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  /** Assert the machine half AND the human half of an error response. A probe
   *  that only checks the status code cannot tell "refused" from "refused for a
   *  reason nobody can act on". */
  async function expectError(
    res: Response,
    status: number,
    code: string,
    fragment?: string,
  ): Promise<string> {
    const body = (await res.json()) as { code?: string; detail?: string };
    const detail = body.detail ?? "";
    if (res.status !== status || body.code !== code)
      throw new Error(`expected ${status}/${code}, got ${res.status}/${body.code ?? "?"} — ${detail}`);
    if (fragment && !detail.includes(fragment))
      throw new Error(`the message never says ${JSON.stringify(fragment)} — it says "${detail}"`);
    return `${status} ${code} · "${detail.length > 64 ? `${detail.slice(0, 63)}…` : detail}"`;
  }

  async function expectOk<T>(res: Response): Promise<T> {
    const body: unknown = await res.json();
    if (res.status !== 200)
      throw new Error(`expected 200, got ${res.status} — ${JSON.stringify(body).slice(0, 200)}`);
    return body as T;
  }

  interface Served {
    images: { base64: string; mime: string }[];
    provenance: {
      provider: string;
      model: string;
      costUsd?: number;
      costBasis?: string;
      reroutedFrom?: { provider: string; why: string }[];
    };
  }

  /** Every case starts with NO canned vendor. A case that forgets to declare
   *  its wire finds out by failing, rather than by quietly inheriting the last
   *  one and asserting something else than it says. */
  const probe = (name: string, fn: () => Promise<string | void>) => {
    wire = null;
    return check(name, fn);
  };

  /* ── the seal itself ───────────────────────────────────────────────────── */

  await probe("seal.blocks-an-unexpected-host", async () => {
    const before = escaped.length;
    let threw = false;
    try {
      await fetch("https://example.invalid/anything");
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("a request to an unexpected host did not throw");
    if (escaped.length !== before + 1) throw new Error("the escape was not recorded");
    // This one was on purpose. Take it back out, so the run-wide assertion at
    // the bottom of this half means exactly what it says.
    return `blocked and recorded: ${escaped.pop()}`;
  });

  /* ── api.ts validation, reached the way a browser reaches it ───────────── */
  //
  // Every one of these declares no vendor at all, so a field that slipped past
  // validation would try to leave the process and be caught by the seal — the
  // check is "400 with a message that explains itself", and the backstop is
  // "and nothing was sent anywhere".

  const REJECTS: [string, keyof typeof routes, unknown, string][] = [
    ["generate.rejects-a-missing-prompt", "generate", { aspect: "16:9" }, "`prompt` is required."],
    ["generate.rejects-an-unknown-aspect", "generate", { prompt: "x", aspect: "21:9" }, "`aspect` must be one of"],
    ["generate.rejects-a-count-out-of-range", "generate", { prompt: "x", aspect: "16:9", count: 99 }, "`count` must be"],
    ["generate.rejects-a-misspelled-avoid", "generate", { prompt: "x", aspect: "16:9", avoid: "gogle" }, "`avoid` must be one of"],
    ["generate.rejects-prefer-equal-to-avoid", "generate", { prompt: "x", aspect: "16:9", prefer: "google", avoid: "google" }, "name the same provider"],
    ["generate.rejects-more-references-than-the-window", "generate", { prompt: "x", aspect: "16:9", references: Array.from({ length: 15 }, () => IMG) }, "at most 14 images"],
    ["generate.rejects-a-body-that-is-not-json", "generate", "this is not json", "not a JSON object"],
    ["edit.rejects-a-missing-image", "edit", { instruction: "x" }, "`image` is required."],
    ["edit.rejects-an-unsupported-mime", "edit", { instruction: "x", image: { base64: PIXEL, mime: "image/gif" } }, "`image.mime` must be one of"],
    ["recognize.rejects-a-missing-instruction", "recognize", { image: IMG }, "`instruction` is required."],
    ["recognize.rejects-a-schema-that-is-not-an-object", "recognize", { image: IMG, instruction: "x", schema: [1, 2] }, "`schema` must be a JSON Schema object."],
  ];

  for (const [name, path, body, fragment] of REJECTS)
    await probe(name, async () => {
      // Keys present on purpose: a 400 has to be validation refusing the
      // request, not the router discovering it has nowhere to send it.
      useKeys(...ALL);
      return expectError(await call(path, body), 400, "bad-request", fragment);
    });

  /* ── the routing outcomes a caller can actually receive ────────────────── */

  await probe("generate.reports-a-missing-key-as-503-and-names-it", async () => {
    useKeys(); // nothing is configured
    process.env.IMAGING_ENV = "dev";
    return expectError(
      await call("generate", { prompt: "x", aspect: "16:9" }),
      503,
      "no-key",
      "GOOGLE_AI_API_KEY",
    );
  });

  await probe("generate.reports-an-emptied-chain-as-409", async () => {
    useKeys("google");
    process.env.IMAGING_ENV = "prod"; // every prod capability is single-entry
    return expectError(
      await call("generate", { prompt: "x", aspect: "16:9", avoid: "google" }),
      409,
      "no-alternative",
      "no second vendor",
    );
  });

  /* ── the happy paths, over canned wire ─────────────────────────────────── */

  await probe("generate.serves-a-plate-and-prices-it", async () => {
    useKeys("google");
    process.env.IMAGING_ENV = "prod";
    let calls = 0;
    wire = (m, u) => (u.host === GOOGLE_HOST && m === "POST" ? (calls++, googleImage()) : null);

    const out = await expectOk<Served>(await call("generate", { prompt: "a plain circle", aspect: "16:9" }));
    if (out.images.length !== 1) throw new Error(`expected 1 image, got ${out.images.length}`);
    if (out.images[0].base64 !== PIXEL)
      throw new Error("the bytes that came back are not the bytes the vendor sent");
    if (out.provenance.provider !== "google") throw new Error(`served by ${out.provenance.provider}`);
    if (out.provenance.costBasis !== "estimated")
      throw new Error(`costBasis was ${out.provenance.costBasis}, expected estimated`);
    if (out.provenance.costUsd !== 0.045)
      throw new Error(`costUsd was ${out.provenance.costUsd}, expected the declared 0.045`);
    return `${calls} vendor call · ${out.provenance.model} · $${out.provenance.costUsd} ${out.provenance.costBasis}`;
  });

  await probe("generate.prices-every-image-it-returns", async () => {
    useKeys("google");
    process.env.IMAGING_ENV = "prod";
    let calls = 0;
    wire = (m, u) => (u.host === GOOGLE_HOST && m === "POST" ? (calls++, googleImage()) : null);

    const out = await expectOk<Served>(await call("generate", { prompt: "x", aspect: "16:9", count: 3 }));
    if (out.images.length !== 3) throw new Error(`expected 3 images, got ${out.images.length}`);
    if (calls !== 3) throw new Error(`3 candidates should be 3 calls, saw ${calls}`);
    if (Math.abs((out.provenance.costUsd ?? 0) - 3 * 0.045) > 1e-9)
      throw new Error(`3 images priced at $${out.provenance.costUsd}`);
    return `${calls} vendor calls · $${out.provenance.costUsd?.toFixed(4)}`;
  });

  await probe("edit.reports-unpriced-rather-than-free", async () => {
    useKeys("google");
    process.env.IMAGING_ENV = "prod";
    wire = (m, u) => (u.host === GOOGLE_HOST && m === "POST" ? googleImage() : null);

    const out = await expectOk<Served>(await call("edit", { image: IMG, instruction: "make it a cube" }));
    if (out.provenance.costBasis !== "unpriced")
      throw new Error(`costBasis was ${out.provenance.costBasis}, expected unpriced`);
    // The KEY, not just the value: an edit pins no image_size, so it cannot be
    // priced, and a `0` arriving in the JSON is what a surface would render as
    // "$0.00" — the one claim about money nobody here can support.
    if ("costUsd" in out.provenance)
      throw new Error(`costUsd reached the caller as ${JSON.stringify(out.provenance.costUsd)}`);
    return "costUsd absent from the JSON · costBasis=unpriced";
  });

  await probe("recognize.returns-json-that-satisfies-the-schema", async () => {
    useKeys("google");
    process.env.IMAGING_ENV = "prod";
    wire = (m, u) =>
      u.host === GOOGLE_HOST && m === "POST"
        ? googleText(
            'Here is the JSON:\n```json\n{"hasText":false,"isFlat":true,"dominantColors":["navy","cream"]}\n```',
          )
        : null;

    const out = await expectOk<{ json?: { hasText?: boolean; dominantColors?: string[] } }>(
      await call("recognize", { image: IMG, instruction: "grade this plate", schema: PLATE_SCHEMA }),
    );
    if (!out.json) throw new Error("a schema was sent and no json came back");
    if (out.json.hasText !== false) throw new Error("hasText did not survive the round trip");
    return `parsed out of fenced prose · colors=[${(out.json.dominantColors ?? []).join("|")}]`;
  });

  await probe("recognize.rejects-prose-when-a-schema-was-sent", async () => {
    useKeys("google");
    process.env.IMAGING_ENV = "prod";
    wire = (m, u) =>
      u.host === GOOGLE_HOST && m === "POST" ? googleText("It looks quite nice, actually.") : null;

    return expectError(
      await call("recognize", { image: IMG, instruction: "grade this plate", schema: PLATE_SCHEMA }),
      502,
      "bad-response",
      "answered with prose",
    );
  });

  /* ── the failure paths that have to stay distinguishable ───────────────── */

  await probe("generate.surfaces-a-safety-block-as-422-refused", async () => {
    useKeys("google");
    process.env.IMAGING_ENV = "prod";
    wire = (m, u) => (u.host === GOOGLE_HOST && m === "POST" ? googleRefusal() : null);
    return expectError(
      await call("generate", { prompt: "a recognisable public figure", aspect: "16:9" }),
      422,
      "refused",
      "safety",
    );
  });

  await probe("generate.treats-an-empty-result-as-a-refusal", async () => {
    useKeys("google");
    process.env.IMAGING_ENV = "prod";
    // The known shape of an undocumented block: a completed interaction with
    // nothing in it. Treated as a refusal because that re-routes, where a false
    // success would hand the caller nothing.
    wire = (m, u) =>
      u.host === GOOGLE_HOST && m === "POST" ? jsonWire({ status: "completed", steps: [] }) : null;
    return expectError(
      await call("generate", { prompt: "x", aspect: "16:9" }),
      422,
      "refused",
      "safety block",
    );
  });

  await probe("generate.will-not-drop-style-references-to-serve-a-fallback", async () => {
    useKeys("google", "leonardo");
    process.env.IMAGING_ENV = "dev"; // dev generate is google, then leonardo
    let leonardoTouched = false;
    wire = (m, u) => {
      if (u.host === LEONARDO_HOST) {
        leonardoTouched = true;
        return jsonWire({}, 500);
      }
      return u.host === GOOGLE_HOST && m === "POST" ? googleRefusal() : null;
    };

    const note = await expectError(
      await call("generate", { prompt: "x", aspect: "16:9", references: [IMG] }),
      422,
      "refused",
      "reference images",
    );
    // The silent near-miss types.ts calls the worst failure this layer could
    // have: a perfectly good image in the wrong style, and nothing reporting it.
    if (leonardoTouched)
      throw new Error("a style-locked request reached Leonardo, which reads no style references");
    return `${note} · leonardo never called`;
  });

  await probe("recognize.re-routes-past-a-rate-limited-vendor", async () => {
    useKeys("qwen", "google");
    process.env.IMAGING_ENV = "dev"; // dev recognize is qwen, then google
    let qwenCalls = 0;
    wire = (m, u) => {
      if (u.host === QWEN_HOST) {
        qwenCalls++;
        return jsonWire({ error: { message: "quota exhausted" } }, 429);
      }
      return u.host === GOOGLE_HOST && m === "POST" ? googleText("a flat diagram of a scale") : null;
    };

    const out = await expectOk<Served>(
      await call("recognize", { image: IMG, instruction: "what is this" }),
    );
    if (out.provenance.provider !== "google") throw new Error(`served by ${out.provenance.provider}`);
    if (qwenCalls !== 3) throw new Error(`qwen rotates 3 SKUs on quota; saw ${qwenCalls} calls`);
    const trail = out.provenance.reroutedFrom ?? [];
    // The re-route has to reach the CALLER, not only the server log: an asset
    // outlives the response it arrived in, and "why is this from google?" has
    // to stay answerable afterwards.
    if (!trail.some((t) => t.provider === "qwen" && t.why === "rate-limited"))
      throw new Error(`the re-route left no trail in the response: ${JSON.stringify(trail)}`);
    return `qwen ×${qwenCalls} rate-limited → google · reroutedFrom=${trail.map((t) => `${t.provider}:${t.why}`).join(",")}`;
  });

  await probe("api.never-hands-the-vendor-body-to-the-caller", async () => {
    useKeys("google");
    process.env.IMAGING_ENV = "prod";
    // http.ts keeps up to 600 characters of raw vendor body in
    // `ImagingError.detail`, which can echo the user's prompt — or, as here,
    // our own key. errorResponse returns `message`, never `detail`, and this is
    // the case that holds it to that.
    wire = (m, u) =>
      u.host === GOOGLE_HOST
        ? jsonWire({ error: { message: `rejected for key ${FAKE.google}` } }, 500)
        : null;

    const res = await call("generate", { prompt: "x", aspect: "16:9" });
    const text = await res.text();
    if (res.status !== 502) throw new Error(`expected 502, got ${res.status}`);
    if (text.includes(FAKE.google))
      throw new Error("the vendor's response body reached the caller, key and all");
    return "502 · the body stayed in ImagingError.detail, which is never serialised";
  });

  await probe("api.scrubs-the-vendor-sentence-it-quotes-back", async () => {
    useKeys("google");
    process.env.IMAGING_ENV = "prod";
    // The case ABOVE covers `ImagingError.detail`, which is never serialised.
    // This one covers `message`, which always is — and which is NOT ours end to
    // end: providers/google.ts:130 splices the vendor's own `error.message`
    // into it verbatim on the failed-interaction path.
    //
    // Measured on 2026-08-14, before api.ts scrubbed this: the log line was
    // defended and the HTTP body was not, for the same string. That asymmetry
    // is what this check exists to prevent coming back — the log was audited,
    // the response simply was never looked at.
    wire = (m, u) =>
      u.host === GOOGLE_HOST
        ? jsonWire(
            { status: "failed", error: { message: `upstream rejected credential ${FAKE.google} at line 3` } },
            200,
          )
        : null;

    const res = await call("generate", { prompt: "x", aspect: "16:9" });
    const text = await res.text();
    if (text.includes(FAKE.google))
      throw new Error("the key the vendor echoed back reached the caller in `detail`");
    if (!text.includes("[redacted]"))
      throw new Error(`expected the masked form in the body, got: ${text.slice(0, 200)}`);
    return "the vendor's sentence is quoted back masked, not verbatim";
  });

  /* ── the price table's own promise ─────────────────────────────────────── */

  await probe("pricing.serves-prices-and-tells-nobody-which-keys-are-set", async () => {
    useKeys(...ALL);
    process.env.IMAGING_ENV = "prod";
    const res = await pricingRoute();
    const withKeys = await res.text();
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

    for (const [vendor, secret] of Object.entries(FAKE))
      if (withKeys.includes(secret)) throw new Error(`the ${vendor} key value is in the price table`);
    for (const name of ["IMAGING_ENV", "NODE_ENV", ...ALL.map((id) => KEY_VAR[id])])
      if (withKeys.includes(name)) throw new Error(`the response mentions ${name}`);

    const top = Object.keys(JSON.parse(withKeys) as Record<string, unknown>).sort().join(",");
    if (top !== "perImage,prices") throw new Error(`unexpected top-level keys: ${top}`);

    // The claim in the route handler's audit, made executable: the body cannot
    // depend on the deployment's configuration, because it is byte for byte the
    // same when the configuration changes underneath it.
    useKeys();
    process.env.IMAGING_ENV = "dev";
    const withNone = await (await pricingRoute()).text();
    if (withNone !== withKeys)
      throw new Error("the price table changed when the keys and the environment did");

    const rows = (JSON.parse(withKeys) as { prices: unknown[] }).prices.length;
    return `${rows} rows · identical with three keys and with none, in dev and in prod`;
  });

  /* ── the assertion the whole half rests on ─────────────────────────────── */

  await probe("seal.nothing-escaped-the-process", async () => {
    if (escaped.length)
      throw new Error(
        `${escaped.length} request(s) tried to reach a vendor: ${escaped.slice(0, 4).join(", ")}`,
      );
    return "no request left the process · no vendor was billed";
  });

  report("offline");
}

/* ══ THE LIVE HALF — REAL VENDORS, REAL MONEY ═══════════════════════════════ */

console.log(`\nimaging integration probe · env=${currentEnv()}`);
console.log(
  `plan · generate=${planFor("generate").join(">")} · edit=${planFor("edit").join(">")} · recognize=${planFor("recognize").join(">")}`,
);
console.log(`keys · leonardo=${isConfigured("leonardo")} qwen=${isConfigured("qwen")} google=${isConfigured("google")}`);
console.log(`out  · ${outDir}\n`);

/** Shared across cases: the plate everything downstream looks at and edits. */
let plate: ImageRef | null = null;

await check("leonardo.generate", async () => {
  if (!isConfigured("leonardo")) skip("LEONARDO_API_KEY not set");

  const res = await leonardoProvider().generate!({
    prompt: `${STYLE}\n\n${SUBJECT}`,
    negativePrompt: NEGATIVE,
    aspect: "16:9",
    count: 1,
  });

  if (!res.images.length) throw new Error("no images returned");
  plate = res.images[0];
  const p = save("leonardo-plate", plate);

  const dim = dimensions(Buffer.from(plate.base64, "base64"));
  if (!dim) throw new Error("could not read image dimensions");
  const ratio = dim.w / dim.h;
  // The silent-9:16 guard. Tolerant of the vendor snapping to its own grid,
  // intolerant of it changing the RATIO.
  if (Math.abs(ratio - 16 / 9) > 0.02)
    throw new Error(`asked 16:9, got ${dim.w}x${dim.h} (ratio ${ratio.toFixed(3)})`);

  // The studio-cleanliness contract. A generation left behind is the failure
  // this check exists for, so it is an assertion and not a log line.
  if (res.provenance.cleanup !== "deleted")
    throw new Error(`generation was not deleted (cleanup=${res.provenance.cleanup}) — Leonardo studio will accumulate clutter`);

  return `${dim.w}x${dim.h}, ${kb(plate)}KB, deleted remotely, $${res.provenance.costUsd?.toFixed(4) ?? "?"} → ${p}`;
});

await check("qwen.recognize", async () => {
  if (!isConfigured("qwen")) skip("QWEN_API_KEY not set");
  if (!plate) skip("no plate to look at");

  const res = await qwenProvider().recognize!({
    image: plate,
    instruction:
      "You are grading a generated infographic plate against its brief. Answer only about what you can see.",
    schema: PLATE_SCHEMA as unknown as Record<string, unknown>,
  });

  if (res.json === undefined) throw new Error("a schema was sent but no json came back");
  const j = res.json as { hasText: boolean; isFlat: boolean; dominantColors: string[] };
  if (typeof j.hasText !== "boolean") throw new Error("hasText was not a boolean");
  if (!Array.isArray(j.dominantColors)) throw new Error("dominantColors was not an array");

  return `${res.provenance.model} · hasText=${j.hasText} isFlat=${j.isFlat} colors=[${j.dominantColors.slice(0, 4).join(", ")}]`;
});

await check("google.edit", async () => {
  if (!isConfigured("google")) skip("GOOGLE_AI_API_KEY not set");
  if (!plate) skip("no plate to edit");

  const res = await googleProvider().edit!({
    image: plate,
    instruction:
      "Keep the composition, the palette and the flat vector style exactly as they are. Change only the coin on the right pan into a simple flat cube.",
  });

  if (!res.images.length) throw new Error("no image returned");
  const p = save("google-edited", res.images[0]);
  return `${kb(res.images[0])}KB → ${p}`;
});

await check("google.generate", async () => {
  if (!isConfigured("google")) skip("GOOGLE_AI_API_KEY not set");

  const res = await googleProvider().generate!({
    prompt: `${STYLE}\n\n${SUBJECT}`,
    negativePrompt: NEGATIVE,
    aspect: "16:9",
    count: 1,
  });

  if (!res.images.length) throw new Error("no images returned");
  const img = res.images[0];
  const p = save("google-plate", img);
  const dim = dimensions(Buffer.from(img.base64, "base64"));
  if (dim) {
    const ratio = dim.w / dim.h;
    if (Math.abs(ratio - 16 / 9) > 0.02)
      throw new Error(`asked 16:9, got ${dim.w}x${dim.h} (ratio ${ratio.toFixed(3)})`);
  }
  return `${res.provenance.model} · ${dim ? `${dim.w}x${dim.h}, ` : ""}${kb(img)}KB → ${p}`;
});

await check("google.recognize", async () => {
  if (!isConfigured("google")) skip("GOOGLE_AI_API_KEY not set");
  if (!plate) skip("no plate to look at");

  const res = await googleProvider().recognize!({
    image: plate,
    instruction: "You are grading a generated infographic plate. Answer only about what you can see.",
    schema: PLATE_SCHEMA as unknown as Record<string, unknown>,
  });

  if (res.json === undefined) throw new Error("a schema was sent but no json came back");
  const j = res.json as { hasText: boolean };
  if (typeof j.hasText !== "boolean") throw new Error("hasText was not a boolean");
  return `${res.provenance.model} · ${JSON.stringify(res.json).slice(0, 90)}`;
});

/* ── style lock: the assertion /library actually rests on ─────────────────── */
//
// Everything above proves the plumbing. This proves the PRODUCT claim: that
// approving plates makes a later frame — of a different subject — come back in
// the same visual language.
//
// It is built as a controlled comparison rather than a vibe check, because
// "these look similar" is exactly the judgement a single generation will
// flatter. Three renders share one style block:
//
//   A   subject 1, unconditioned          the anchor
//   B   subject 2, conditioned on A       the claim
//   C   subject 2, unconditioned          the control
//
// A vision model then reads all three back through one schema, and we compare
// how much of A's palette survives into B versus into C. Without C the test
// could not tell style-lock from the style block already being specific enough
// on its own — which, given the block names three hex colours, is a genuinely
// plausible alternative explanation.

const LOCK_SCHEMA = {
  type: "object",
  required: ["dominantColors", "technique"],
  properties: {
    dominantColors: {
      type: "array",
      items: { type: "string" },
      description: "two to four plain lowercase colour names, most prominent first",
    },
    technique: { type: "string", description: "a short phrase naming the rendering technique" },
  },
} as const;

const SUBJECT_1 = "Three ascending bars on a ground line, with one arrow arcing over them.";
const SUBJECT_2 = "Two interlocking gears, the larger turning the smaller, on a plain ground.";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
/** Share of A's colours that also appear in X. Substring-tolerant, because a
 *  model may say "dark navy" where it earlier said "navy". */
function paletteOverlap(a: string[], x: string[]): number {
  if (!a.length) return 0;
  const xs = x.map(norm);
  const hit = a
    .map(norm)
    .filter((c) => xs.some((y) => y.includes(c) || c.includes(y))).length;
  return hit / a.length;
}

await check("style-lock.holds", async () => {
  if (!isConfigured("google")) skip("GOOGLE_AI_API_KEY not set");

  const google = googleProvider();
  const style = STYLE; // one block across all three renders

  const gen = async (subject: string, references?: ImageRef[]) =>
    references
      ? // Through the ROUTER on purpose: a referenced request must be moved off
        // Leonardo, and this is where that routing decision gets proved.
        (await import("../lib/imaging/router")).generate({
          prompt: `${style}\n\n${subject}`,
          negativePrompt: NEGATIVE,
          aspect: "16:9",
          count: 1,
          references,
        })
      : google.generate!({ prompt: `${style}\n\n${subject}`, negativePrompt: NEGATIVE, aspect: "16:9", count: 1 });

  const a = await gen(SUBJECT_1);
  if (!a.images.length) throw new Error("anchor produced no image");
  save("lock-a-anchor", a.images[0]);

  const b = await gen(SUBJECT_2, [a.images[0]]);
  if (!b.images.length) throw new Error("conditioned render produced no image");
  save("lock-b-conditioned", b.images[0]);
  if (b.provenance.provider !== "google")
    throw new Error(
      `a referenced request was routed to ${b.provenance.provider}, which cannot honour style references`,
    );

  const c = await gen(SUBJECT_2);
  if (!c.images.length) throw new Error("control produced no image");
  save("lock-c-control", c.images[0]);

  const read = async (img: ImageRef) => {
    const r = await google.recognize!({
      image: img,
      instruction: "Describe only what you can see of this image's visual style.",
      schema: LOCK_SCHEMA as unknown as Record<string, unknown>,
    });
    return r.json as { dominantColors: string[]; technique: string };
  };

  const [ra, rb, rc] = [await read(a.images[0]), await read(b.images[0]), await read(c.images[0])];
  const locked = paletteOverlap(ra.dominantColors, rb.dominantColors);
  const control = paletteOverlap(ra.dominantColors, rc.dominantColors);

  // The absolute bar is the assertion; the comparison is EVIDENCE, reported
  // either way. Failing on (locked > control) at n=1 would be a coin flip
  // dressed as a test — the block names three hex colours, so the control is
  // expected to score well too.
  const verdict =
    `anchor=[${ra.dominantColors.join("|")}] · locked ${(locked * 100).toFixed(0)}% ` +
    `vs control ${(control * 100).toFixed(0)}% · technique "${rb.technique}"` +
    (locked < control ? "  ⚠ conditioning scored WORSE than the control" : "");

  if (locked < 0.5)
    throw new Error(`style did not survive the subject change — only ${(locked * 100).toFixed(0)}% of the anchor palette held. ${verdict}`);

  return verdict;
});

/* ── summary ──────────────────────────────────────────────────────────────── */

report("live");
