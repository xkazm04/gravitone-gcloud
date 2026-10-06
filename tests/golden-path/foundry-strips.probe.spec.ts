// LANE — THE /foundry STRIPS SEAMS, called as functions against the real disk (dynamic).
//
// The Strips tab triages code-rendered strips (lib/foundry/strips/store.ts),
// and three of its seams carry a promise a source match cannot prove:
//
//   1. The verdicts PUT refuses a map it cannot fully read — a chip outside
//      STRIP_CHIPS, an unknown card, a note over the limit — with a 400,
//      rather than dropping the bad part and answering 200 (the Dojo's rule,
//      wrong here: a dropped chip is a lost learning signal).
//   2. `kind=strips` on /api/foundry/file serves .mp4/.webm with a Range
//      honoured as a 206 — what a <video> needs to start and seek — while
//      every other kind still refuses video, and strips never serve the page.
//   3. strip.html is LLM-written code. It goes out only through the page
//      route, under `sandbox allow-scripts` and `default-src 'none'`.
//   4. Nothing walks out of the run: `..`, a backslash, a crafted run id.
//
// And the commit, which is destructive: kept strips land in a temp
// FOUNDRY_DIR's motion-styles, rejected media are gone, every decided strip
// has a ledger row, findings print n beside every rate, the token fences it.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";
import { GET as fileGET } from "@/app/api/foundry/file/route";
import { GET as commitGET, POST as commitPOST } from "@/app/api/foundry/strips/[id]/commit/route";
import { GET as pageGET } from "@/app/api/foundry/strips/[id]/page/route";
import { PUT as verdictsPUT } from "@/app/api/foundry/strips/[id]/verdicts/route";
import type { MotionStylesDoc, StripCommitPlan, StripCommitResult, StripsLedgerDoc } from "@/lib/foundry/strips/triage";
import type { StripCard, StripRun } from "@/lib/foundry/strips/types";

import { keepEnv, probeFoundryDir } from "./_helpers";

keepEnv([ACCESS_SECRET_VAR, "NEXT_PUBLIC_DEV_AUTH"]);
const foundryDir = probeFoundryDir();

const SECRET = "strips-probe-secret";
const ROOT = path.join(process.cwd(), "foundry-out", "strips");
const AUTH = { authorization: `Bearer ${SECRET}` };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let runId = "";
/** 1000 bytes, each its own index mod 251, so a range is checkable by value. */
const VIDEO = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);

const MEDIA = { html: "strip.html", style: "style.json", mp4: "strip.mp4", webm: "strip.webm", poster: "poster.jpg", sheet: "sheet.png" };
function card(id: string, over: Partial<StripCard> = {}): StripCard {
  return { id, lane: "edu", case: "edu-01", approach: "E01", effort: "medium", status: "rendered", rounds: 0, authorMs: 1, renderMs: 1, files: { ...MEDIA }, ...over };
}

test.beforeEach(() => {
  process.env[ACCESS_SECRET_VAR] = SECRET;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  runId = `probe-strips-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const dir = path.join(ROOT, runId);
  const cards = [
    card("edu-edu-01--E01", { gates: { seek: { ok: true, detail: "0 px" }, legibility: { ok: false, detail: "18 px (bar 26)" }, motion: { ok: true, detail: "8/8 s" }, length: { ok: true, detail: "240" } } }),
    card("edu-edu-01--E02", { approach: "E02" }),
    card("stat-stat-01--S01", { lane: "stat", case: "stat-01", approach: "S01" }),
    card("stat-stat-01--S07", { lane: "stat", case: "stat-01", approach: "S07", status: "render-failed", files: { html: "strip.html" }, error: "boom" }),
  ];
  for (const c of cards) {
    const cd = path.join(dir, c.id);
    mkdirSync(cd, { recursive: true });
    writeFileSync(path.join(cd, "strip.html"), "<!doctype html><script>window.renderFrameAt=function(i){}</script>");
    writeFileSync(path.join(cd, "style.json"), JSON.stringify({ name: c.id }));
    if (c.status !== "rendered") continue;
    writeFileSync(path.join(cd, "strip.mp4"), VIDEO);
    writeFileSync(path.join(cd, "strip.webm"), VIDEO);
    writeFileSync(path.join(cd, "poster.jpg"), "jpg");
    writeFileSync(path.join(cd, "sheet.png"), "png");
  }
  const run: StripRun = {
    version: 1,
    id: runId,
    at: new Date().toISOString(),
    width: { edu: 1920, stat: 1080 },
    height: { edu: 1080, stat: 1920 },
    fps: 30,
    frames: 240,
    approaches: [
      { id: "E01", lane: "edu", case: "edu-01", name: "Ink", medium: "svg", grammar: "draw-on", density: "low", leonardo: "none", direction: "d", falsifier: "f" },
      { id: "E02", lane: "edu", case: "edu-01", name: "Grain", medium: "canvas", grammar: "particle", density: "high", leonardo: "texture", direction: "d", falsifier: "f" },
      { id: "S01", lane: "stat", case: "stat-01", name: "Bars", medium: "dom", grammar: "stepped", density: "mid", seat: "chart", leonardo: "none", direction: "d", falsifier: "f" },
    ],
    cards,
    status: "awaiting-triage",
  };
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(run, null, 2));
});

test.afterEach(() => {
  if (runId) rmSync(path.join(ROOT, runId), { recursive: true, force: true });
});

const put = (body: unknown, id = runId) =>
  verdictsPUT(new Request(`http://studio.local/api/foundry/strips/${id}/verdicts`, { method: "PUT", headers: { ...AUTH, "content-type": "application/json" }, body: JSON.stringify(body) }), ctx(id));
const file = (q: Record<string, string>, headers: Record<string, string> = {}) =>
  fileGET(new Request(`http://studio.local/api/foundry/file?${new URLSearchParams(q).toString()}`, { headers: { ...AUTH, ...headers } }));
const page = (card: string, id = runId) => pageGET(new Request(`http://studio.local/api/foundry/strips/${id}/page?${new URLSearchParams({ card }).toString()}`, { headers: AUTH }), ctx(id));

/* ── 1. verdicts ──────────────────────────────────────────────────────────── */

test("verdicts PUT: a chip outside STRIP_CHIPS is refused whole with 400, and nothing is written", async () => {
  const res = await put({ verdicts: { "edu-edu-01--E01": { verdict: "keep", at: "t", chips: ["concept", "vibes"] } } });
  const body = (await res.json()) as { detail: string };
  console.log(`[strips] bad chip -> ${res.status} ${body.detail.slice(0, 80)}`);
  expect(res.status).toBe(400);
  expect(body.detail).toContain("vibes");
  expect(existsSync(path.join(ROOT, runId, "verdicts.json"))).toBe(false);
});

test("verdicts PUT: an unknown card, a failed card, a fourth chip, an overlong note and a bad verdict are each 400", async () => {
  const cases: [string, unknown][] = [
    ["unknown card", { "edu-edu-01--E99": { verdict: "keep", at: "t" } }],
    ["failed card", { "stat-stat-01--S07": { verdict: "reject", at: "t" } }],
    ["four chips", { "edu-edu-01--E01": { verdict: "reject", at: "t", chips: ["concept", "motion", "craft", "generic"] } }],
    ["long note", { "edu-edu-01--E01": { verdict: "keep", at: "t", note: "x".repeat(501) } }],
    ["bad verdict", { "edu-edu-01--E01": { verdict: "maybe", at: "t" } }],
  ];
  for (const [what, verdicts] of cases) {
    const res = await put({ verdicts });
    console.log(`[strips] ${what} -> ${res.status}`);
    expect(res.status, what).toBe(400);
  }
});

test("verdicts PUT: a clean map is stored as sent, null clears, and the run's chips survive the round trip", async () => {
  const res = await put({
    verdicts: {
      "edu-edu-01--E01": { verdict: "reject", at: "2026-10-06T00:00:00Z", chips: ["legibility", "too-busy"], note: "the labels vanish" },
      "edu-edu-01--E02": null,
      "stat-stat-01--S01": { verdict: "keep", at: "2026-10-06T00:00:01Z" },
    },
  });
  expect(res.status).toBe(200);
  const onDisk = JSON.parse(readFileSync(path.join(ROOT, runId, "verdicts.json"), "utf8"));
  expect(onDisk).toEqual({
    "edu-edu-01--E01": { verdict: "reject", at: "2026-10-06T00:00:00Z", chips: ["legibility", "too-busy"], note: "the labels vanish" },
    "stat-stat-01--S01": { verdict: "keep", at: "2026-10-06T00:00:01Z" },
  });
});

/* ── 2. video, with Range, for strips only ────────────────────────────────── */

test("file route: kind=strips answers a Range on a webm with 206 and exactly those bytes", async () => {
  const res = await file({ run: runId, path: "edu-edu-01--E01/strip.webm", kind: "strips" }, { range: "bytes=10-19" });
  console.log(`[strips] range -> ${res.status} ${res.headers.get("content-range")}`);
  expect(res.status).toBe(206);
  expect(res.headers.get("content-type")).toBe("video/webm");
  expect(res.headers.get("accept-ranges")).toBe("bytes");
  expect(res.headers.get("content-range")).toBe(`bytes 10-19/${VIDEO.length}`);
  expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...VIDEO.slice(10, 20)]);

  const suffix = await file({ run: runId, path: "edu-edu-01--E01/strip.mp4", kind: "strips" }, { range: "bytes=-5" });
  expect(suffix.status).toBe(206);
  expect(suffix.headers.get("content-type")).toBe("video/mp4");
  expect(suffix.headers.get("content-range")).toBe(`bytes ${VIDEO.length - 5}-${VIDEO.length - 1}/${VIDEO.length}`);

  const past = await file({ run: runId, path: "edu-edu-01--E01/strip.webm", kind: "strips" }, { range: `bytes=${VIDEO.length}-` });
  expect(past.status).toBe(416);

  const whole = await file({ run: runId, path: "edu-edu-01--E01/strip.webm", kind: "strips" });
  expect(whole.status).toBe(200);
  expect((await whole.arrayBuffer()).byteLength).toBe(VIDEO.length);
});

test("file route: every other kind still refuses video, and strips never serve the page", async () => {
  for (const kind of ["training", "extract", ""]) {
    const res = await file({ run: runId, path: "x/strip.mp4", ...(kind ? { kind } : {}) });
    expect(res.status, `kind=${kind || "forge"}`).toBe(400);
  }
  const html = await file({ run: runId, path: "edu-edu-01--E01/strip.html", kind: "strips" });
  expect(html.status).toBe(400);
});

/* ── 3. the page, sandboxed ───────────────────────────────────────────────── */

test("page route: strip.html goes out under the sandbox CSP and nosniff", async () => {
  const res = await page("edu-edu-01--E01");
  expect(res.status).toBe(200);
  const csp = res.headers.get("content-security-policy") ?? "";
  console.log(`[strips] page CSP -> ${csp}`);
  expect(csp).toBe("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: 'self'; font-src data:; sandbox allow-scripts");
  expect(csp).not.toContain("allow-same-origin");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(await res.text()).toContain("renderFrameAt");
});

test("page route: the access guard holds — no credential, no page", async () => {
  const res = await pageGET(new Request(`http://studio.local/api/foundry/strips/${runId}/page?card=edu-edu-01--E01`), ctx(runId));
  expect(res.status).toBe(401);
  const viaK = await pageGET(new Request(`http://studio.local/api/foundry/strips/${runId}/page?card=edu-edu-01--E01&k=${SECRET}`), ctx(runId));
  expect(viaK.status).toBe(200);
});

/* ── 4. containment ───────────────────────────────────────────────────────── */

test("traversal: `..`, a backslash and a crafted run id are refused; a card id is not a path", async () => {
  const outs = [
    await file({ run: runId, path: "../../package.json", kind: "strips" }),
    await file({ run: runId, path: "..\\..\\package.json", kind: "strips" }),
    await file({ run: runId, path: "edu-edu-01--E01/../../../run.json", kind: "strips" }),
    await file({ run: "..", path: "package.json", kind: "strips" }),
  ];
  for (const r of outs) expect([400, 404]).toContain(r.status);
  expect(outs[0].status).toBe(400);
  expect(outs[3].status).toBe(400);

  expect((await page("../../../package.json")).status).toBe(404);
  expect((await page("edu-edu-01--E01", "..")).status).toBe(400);
  expect((await put({ verdicts: {} }, "../x")).status).toBe(400);
});

/* ── the commit ───────────────────────────────────────────────────────────── */

test("commit: kept into motion-styles, rejected media gone, a ledger row per decided card, n beside every rate", async () => {
  expect(
    (
      await put({
        verdicts: {
          "stat-stat-01--S01": { verdict: "keep", at: "2026-10-06T00:00:00Z", chips: ["concept"], note: "lands" },
          "edu-edu-01--E01": { verdict: "reject", at: "2026-10-06T00:00:01Z", chips: ["legibility"] },
        },
      })
    ).status,
  ).toBe(200);

  const planRes = await commitGET(new Request(`http://studio.local/api/foundry/strips/${runId}/commit`, { headers: AUTH }), ctx(runId));
  const plan = (await planRes.json()) as StripCommitPlan;
  expect(plan.counts).toEqual({ kept: 1, rejected: 1, undecided: 2 });
  expect(plan.styles).toEqual([`${runId}--stat-stat-01--S01`]);

  const post = (token: string) =>
    commitPOST(new Request(`http://studio.local/api/foundry/strips/${runId}/commit`, { method: "POST", headers: { ...AUTH, "content-type": "application/json" }, body: JSON.stringify({ token }) }), ctx(runId));
  expect((await post("stale-token")).status).toBe(409);

  const res = await post(plan.token);
  const result = (await res.json()) as StripCommitResult;
  console.log(`[strips] commit -> ${res.status} kept ${result.kept} rejected ${result.rejected} deleted ${result.deleted}`);
  expect(res.status).toBe(200);
  expect(result.deleted).toBe(4);
  expect(result.ledgerRows).toBe(2);

  const fdir = foundryDir();
  const sid = `${runId}--stat-stat-01--S01`;
  const styles = JSON.parse(readFileSync(path.join(fdir, "motion-styles.json"), "utf8")) as MotionStylesDoc;
  expect(styles._purpose).toBeTruthy();
  expect(styles.styles).toHaveLength(1);
  expect(styles.styles[0]).toMatchObject({ id: sid, name: "Bars", lane: "stat", approach: "S01", status: "candidate", origin: { kind: "code", run: runId, card: "stat-stat-01--S01" }, chips: ["concept"], note: "lands" });
  for (const f of ["strip.html", "style.json", "poster.jpg", "sheet.png"]) expect(existsSync(path.join(fdir, "motion-styles", sid, f)), f).toBe(true);
  expect(existsSync(path.join(fdir, "motion-styles", sid, "strip.mp4"))).toBe(false);

  const ledger = JSON.parse(readFileSync(path.join(fdir, "strips-ledger.json"), "utf8")) as StripsLedgerDoc;
  expect(ledger.rows.map((r) => `${r.card}:${r.verdict}`).sort()).toEqual(["edu-edu-01--E01:reject", "stat-stat-01--S01:keep"]);

  const rej = path.join(ROOT, runId, "edu-edu-01--E01");
  for (const f of ["strip.mp4", "strip.webm", "poster.jpg", "sheet.png"]) expect(existsSync(path.join(rej, f)), f).toBe(false);
  for (const f of ["strip.html", "style.json"]) expect(existsSync(path.join(rej, f)), f).toBe(true);
  // Undecided: untouched.
  expect(existsSync(path.join(ROOT, runId, "edu-edu-01--E02", "strip.webm"))).toBe(true);
  // Kept: untouched in foundry-out too.
  expect(existsSync(path.join(ROOT, runId, "stat-stat-01--S01", "strip.webm"))).toBe(true);

  const findings = readFileSync(path.join(ROOT, runId, "findings.md"), "utf8");
  const rates = findings.split("\n").filter((l) => / kept \(\d+%/.test(l));
  expect(rates.length).toBeGreaterThan(5);
  for (const l of rates) expect(l, l).toMatch(/n=\d+\)$/);
  expect(findings).toContain("legibility: on 1 card(s)");

  const after = JSON.parse(readFileSync(path.join(ROOT, runId, "run.json"), "utf8")) as StripRun;
  expect(after.status).toBe("committed");
  expect(after.cards.find((c) => c.id === "edu-edu-01--E01")?.files).toEqual({ html: "strip.html", style: "style.json" });

  // Final: verdicts and a second commit are refused.
  expect((await put({ verdicts: {} })).status).toBe(409);
  expect((await post(plan.token)).status).toBe(409);
  // The journal names the op.
  const journal = readFileSync(path.join(fdir, "catalogue-journal.jsonl"), "utf8");
  expect(journal).toContain('"op":"strip-commit"');
});
