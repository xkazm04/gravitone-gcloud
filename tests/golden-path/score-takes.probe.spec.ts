// LANE — SCORE CUES BECOME TAKES (MUSIC-B stage 1, with frames-score-cut-A's
// Cut-side resolution), offline and against a temp sound store.
//
// The ADR this closes (.vault/Architect/decisions/2026-08-29-score-take-persistence.md)
// asked whether a Score take survives the tab. Its options A/B/C all assumed the
// bytes would live in the browser or not at all. The answer it predates — option
// D — is the asset in the server-side sound store and the decision in the step
// record: a render files a take (origin "score", linked to its project and cue),
// and the spot holds only pointers (`takeIds`, `activeTakeId`). What is pinned:
//
//   1 · op "cue" renders a CueBrief through the doctrine (cueToPlan) on the
//       stored-for-inpainting path, files a take linked to {projectId, cueId}
//       with a song id, and the spot's pointer reaches it again after a reload;
//   2 · two renders are two takes, both listed, and the ACTIVE one is the
//       creator's pick — a newer render does not steal it;
//   3 · a note on one section of a score take is a section edit: the other
//       sections ride as audio references, the child points at its parent and
//       keeps the cue linkage;
//   4 · a finalized lab take is adopted onto a cue with no vendor call;
//   6 · judging a score take writes its ledger row in the same transaction;
//   Cut · the music lane resolves the spot's active take to the store's file
//       URL, and a take the store no longer has is `missing` with a reason —
//       never `ok`.
//
// The vendor is `globalThis.fetch` REPLACED: any URL the fake does not
// recognise fails the test, so no ElevenLabs call is ever made.
//
// The import below has a SIDE EFFECT and must come first — it installs the
// storage engine on globalThis before any module under test reads `indexedDB`.
import "fake-indexeddb/auto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { __resetMusicBudget } from "@/lib/music/budget";
import { readLedger } from "@/lib/sound/store";
import { createTake } from "@/lib/sound/takes";
import { takeFileUrl } from "@/lib/sound/client";
import type { SoundTake } from "@/lib/sound/types";
import type { CuePicture } from "@/lib/music/types";
import { GET as takesGET } from "@/app/api/sound/takes/route";
import { PATCH as takePATCH } from "@/app/api/sound/takes/[id]/route";
import { POST as generatePOST } from "@/app/api/sound/generate/route";
import { deriveTimeline } from "@/app/_phases/cut/deriveTimeline";
import { emptyClip, type Frame } from "@/app/_phases/frames/frames";
import type { ScoreSpot } from "@/app/_phases/score/spots";
import {
  activateTake,
  adoptTake,
  adoptable,
  bindTake,
  cueTakeRequest,
  cueTakes,
  revisionRequest,
  sectionsOf,
} from "@/app/_phases/score/takes";
import { readStep, saveStep, __resetSaveSlots, type ScoreStepData } from "@/app/_phases/_shared/stepStore";
import { openDb, runTx, STEPS_STORE } from "@/lib/studioDb";
import { MUSIC_STYLE_BLOCK, type SpottingCue } from "@/app/_studio/score";

import { keepEnv } from "./_helpers";

const SECRET = "score-takes-secret";
keepEnv(["SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "ELEVENLABS_API_KEY", "MUSIC_BUDGET_SECONDS_PER_WINDOW", "NEXT_PUBLIC_DEV_AUTH", ACCESS_SECRET_VAR]);

let root = "";
const realFetch = globalThis.fetch;
let calls: { url: string; body: Record<string, unknown> | null }[] = [];
let song = 0;

/** The vendor, faked: the detailed endpoint answers with audio, the plan it
 *  was sent (echoed, as the real one returns its own), and a fresh song id. */
function vendor(url: string, body: Record<string, unknown> | null): Response | null {
  if (url !== "https://api.elevenlabs.io/v1/music/detailed") return null;
  const plan = (body?.composition_plan as unknown) ?? null;
  return Response.json({
    audio_base_64: Buffer.from(new Uint8Array(3000).fill(7)).toString("base64"),
    composition_plan: plan,
    song_id: `song-score-${++song}`,
  });
}

test.beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "score-takes-"));
  process.env.SOUND_STORE_DIR = path.join(root, "store");
  process.env.SOUND_LEDGER_PATH = path.join(root, "ledger.json");
  process.env.ELEVENLABS_API_KEY = "probe-key";
  delete process.env.MUSIC_BUDGET_SECONDS_PER_WINDOW;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  process.env[ACCESS_SECRET_VAR] = SECRET;
  __resetMusicBudget();
  __resetRateLimit();
  __resetSaveSlots();
  calls = [];
  song = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: Record<string, unknown> | null = null;
    try {
      body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    calls.push({ url, body });
    const r = vendor(url, body);
    if (!r) throw new Error(`probe: unexpected network call to ${url}`);
    return r;
  }) as typeof fetch;
  const db = await openDb();
  await runTx(db, STEPS_STORE, "readwrite", (store) => {
    store.clear();
  });
  db.close();
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  rmSync(root, { recursive: true, force: true });
});

/* ── fixtures ─────────────────────────────────────────────────────────────── */

let ipN = 0;
function rq(pathname: string, init: { method?: string; json?: unknown } = {}): Request {
  const headers: Record<string, string> = { authorization: `Bearer ${SECRET}`, "x-forwarded-for": `10.7.${++ipN % 250}.1` };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${pathname}`, {
    method: init.method ?? "GET",
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
}

const PICTURE: CuePicture = {
  projectTitle: "Pier Seven",
  logline: "a night shift that does not end",
  scenes: [
    { index: 1, slug: "EXT. PIER 7 — NIGHT", mood: "cold / waiting", startS: 0, durS: 8 },
    { index: 2, slug: "INT. CABIN", mood: "close", startS: 8, durS: 5 },
    { index: 3, slug: "EXT. HARBOUR", mood: "release", startS: 13, durS: 6 },
  ],
};

const CUE: SpottingCue = {
  id: "spot-open",
  title: "the open",
  note: "the harbour before anyone speaks",
  bpm: 90,
  startS: 0,
  durS: 19,
  picture: PICTURE,
};

const SPOT: ScoreSpot = { id: "spot-open", title: "the open", sceneIds: ["f1", "f2", "f3"], note: CUE.note, bpm: 90 };

async function renderCue(projectId = "p-pier", cue: SpottingCue = CUE): Promise<SoundTake> {
  const req = cueTakeRequest(cue, projectId);
  expect(req, "a cue with a tempo and a picture is renderable").not.toBeNull();
  const res = await generatePOST(rq("/api/sound/generate", { method: "POST", json: req }));
  const b = (await res.json()) as { take?: SoundTake; error?: string };
  expect(res.status, b.error ?? "").toBe(201);
  return b.take!;
}

async function shelf(query: string): Promise<SoundTake[]> {
  const res = await takesGET(rq(`/api/sound/takes${query}`));
  expect(res.status).toBe(200);
  return ((await res.json()) as { takes: SoundTake[] }).takes;
}

/* ── 1 · a cue render is a take, linked, and it survives the reload ──────── */

test("case 1: op cue renders the brief through the doctrine and files a score take linked to project and cue", async () => {
  const take = await renderCue();

  expect(calls.length).toBe(1);
  const sent = calls[0].body as { composition_plan: { chunks: { text: string; duration_ms: number }[] }; store_for_inpainting?: boolean };
  // Stored for inpainting, or the section revision below has nothing to edit.
  expect(sent.store_for_inpainting).toBe(true);
  // One section per scene, at the scene's own length — cueToPlan's doctrine,
  // decided server-side, not a client-typed plan.
  expect(sent.composition_plan.chunks.map((c) => c.duration_ms)).toEqual([8000, 5000, 6000]);
  expect(sent.composition_plan.chunks[0].text).toContain("the harbour before anyone speaks");

  expect(take).toMatchObject({
    origin: "score",
    op: "cue",
    kind: "music",
    projectId: "p-pier",
    cueId: "spot-open",
    songId: "song-score-1",
    tempoBpm: 90,
    durationS: 19,
    verdict: "unjudged",
  });
  expect(take.file?.bytes).toBe(3000);
  console.log(`[score-takes] cue render -> ${take.id} origin=${take.origin} op=${take.op} song=${take.songId}`);

  // Another project's cue of the same id is not this cue's take.
  await renderCue("p-other");
  const mine = await shelf("?projectId=p-pier&cueId=spot-open");
  expect(mine.map((t) => t.id)).toEqual([take.id]);

  // THE RELOAD. The spot holds the pointer; the step record is written and
  // read back fresh, and the pointer resolves against the store again.
  const bound = bindTake(SPOT, take.id);
  expect(bound.takeIds).toEqual([take.id]);
  expect(bound.activeTakeId).toBe(take.id);
  await saveStep<ScoreStepData>("p-pier", "score", { spots: [bound] });
  const back = await readStep<ScoreStepData>("p-pier", "score");
  expect(back.ok).toBe(true);
  const spot = back.ok ? back.data!.spots[0] : null;
  expect(spot?.takeIds).toEqual([take.id]);
  // No blob: URL is ever stored — the record carries ids, not audio.
  expect(JSON.stringify(back.ok ? back.data : {})).not.toContain("blob:");
  const listed = cueTakes(spot!, await shelf("?kind=music"));
  expect(listed.map((r) => [r.id, r.take?.id ?? null])).toEqual([[take.id, take.id]]);
});

test("case 1: a cue request is refused before any spend when its linkage or picture is missing", async () => {
  const req = cueTakeRequest(CUE, "p-pier")!;
  const bad = [
    { ...req, projectId: null },
    { ...req, cueId: null },
    { ...req, cue: { ...req.cue!, picture: { ...PICTURE, scenes: [] } } },
    { ...req, cue: { ...req.cue!, bpm: 300 } },
    { ...req, op: "compose", prompt: "anything", durationS: 10 },
  ];
  for (const b of bad) {
    const res = await generatePOST(rq("/api/sound/generate", { method: "POST", json: b }));
    expect(res.status, JSON.stringify(b).slice(0, 120)).toBe(400);
  }
  expect(calls.length, "a refused request reached the vendor").toBe(0);
  // No tempo, no request: the number is the creator's, not the builder's.
  expect(cueTakeRequest({ ...CUE, bpm: undefined }, "p-pier")).toBeNull();
});

/* ── 2 · two renders are two takes; the active one is the creator's pick ── */

test("case 2: rendering twice keeps both takes, and the active take follows the pick, not the newest", async () => {
  const a = await renderCue();
  const b = await renderCue();
  expect(a.id).not.toBe(b.id);
  expect(calls.length).toBe(2);

  let spot = bindTake(SPOT, a.id);
  spot = bindTake(spot, b.id);
  expect(spot.takeIds).toEqual([a.id, b.id]);
  // The second render did not steal the active slot.
  expect(spot.activeTakeId).toBe(a.id);
  // Binding the same id twice is one pointer.
  expect(bindTake(spot, b.id).takeIds).toEqual([a.id, b.id]);

  spot = activateTake(spot, b.id);
  expect(spot.activeTakeId).toBe(b.id);
  // An id the spot does not hold cannot be made active.
  expect(activateTake(spot, "st-nobody").activeTakeId).toBe(b.id);

  // Both stay listed and playable from the store.
  const rows = cueTakes(spot, await shelf("?kind=music"));
  expect(rows.map((r) => r.id)).toEqual([a.id, b.id]);
  for (const r of rows) expect(r.take?.file?.bytes).toBe(3000);
  console.log(`[score-takes] two renders -> ${rows.map((r) => r.id).join(", ")} active=${spot.activeTakeId}`);
});

test("case 2: a take the store has but the spot lost its pointer to is still listed for its cue", async () => {
  const a = await renderCue();
  // The bind never reached the record (a closed tab before the save landed).
  const rows = cueTakes(SPOT, await shelf("?kind=music"), "p-pier");
  expect(rows.map((r) => r.id)).toEqual([a.id]);
});

/* ── 3 · a note on one section is a section edit of that section only ───── */

test("case 3: a revision of section 2 of 3 keeps 1 and 3 as audio references and files a linked child", async () => {
  const source = await renderCue();
  const sections = sectionsOf(source);
  expect(sections.map((s) => [s.startMs, s.endMs])).toEqual([
    [0, 8000],
    [8000, 13000],
    [13000, 19000],
  ]);

  const req = revisionRequest(source, 1, "darker, the strings drop out");
  expect(req.editModes).toEqual(["keep", "medium", "keep"]);
  const res = await generatePOST(rq("/api/sound/generate", { method: "POST", json: req }));
  const out = (await res.json()) as { take?: SoundTake; error?: string };
  expect(res.status, out.error ?? "").toBe(201);

  const sent = calls[1].body as { composition_plan: { chunks: Record<string, unknown>[] } };
  const chunks = sent.composition_plan.chunks;
  expect(chunks[0]).toEqual({ song_id: "song-score-1", range: { start_ms: 0, end_ms: 8000 } });
  expect(chunks[2]).toEqual({ song_id: "song-score-1", range: { start_ms: 13000, end_ms: 19000 } });
  expect(chunks[1]).toMatchObject({ duration_ms: 5000, condition_strength: "medium" });
  expect(String(chunks[1].text)).toContain("darker, the strings drop out");

  const child = out.take!;
  expect(child).toMatchObject({ parentId: source.id, op: "section-edit", origin: "score", projectId: "p-pier", cueId: "spot-open" });
  console.log(`[score-takes] revision -> ${child.id} parent=${child.parentId} modes=${JSON.stringify(child.editModes)}`);
});

/* ── 4 · a finalized lab take is adopted with no render ──────────────────── */

test("case 4: adopting a finalized lab take labelled pier-night makes it the cue's active take, no vendor call", async () => {
  const bytes = { bytes: new Uint8Array(2048).fill(9), mime: "audio/mpeg", name: "pier.mp3" };
  const { take: lab } = await createTake(
    { origin: "lab", kind: "music", title: "pier at night", verdict: "kept", stage: "finalized", label: "pier-night" },
    bytes,
  );
  await createTake({ origin: "lab", kind: "music", title: "kept, not final", verdict: "kept" }, bytes);

  const pickable = adoptable(await shelf("?kind=music"), "pier");
  expect(pickable.map((t) => t.id)).toEqual([lab.id]);

  const spot = adoptTake(bindTake(SPOT, "st-earlier"), lab.id);
  expect(spot.activeTakeId).toBe(lab.id);
  expect(spot.takeIds).toEqual(["st-earlier", lab.id]);
  expect(calls.length, "adopting is not a render").toBe(0);
});

/* ── 6 · a score verdict is a ledger row, in the same write ──────────────── */

test("case 6: judging a score take writes its ledger row with origin score", async () => {
  const take = await renderCue();
  const res = await takePATCH(rq(`/api/sound/takes/${take.id}`, { method: "PATCH", json: { verdict: "kept", ratings: { melody: 7 } } }), {
    params: Promise.resolve({ id: take.id }),
  });
  expect(res.status).toBe(200);
  const row = (await readLedger()).verdicts.find((v) => v.takeId === take.id);
  expect(row).toMatchObject({ origin: "score", op: "cue", verdict: "kept" });
});

/* ── Cut · the music lane reads the spot's pointer, honestly ─────────────── */

const frame = (id: string, at: string, atS: number): Frame => ({
  id,
  at,
  atS,
  kind: "movement",
  title: `shot ${id}`,
  line: "",
  plate: { state: "empty" },
  clip: emptyClip(),
  elements: [],
  texts: [],
});
const FRAMES = [frame("f1", "0:00", 0), frame("f2", "0:08", 8), frame("f3", "0:13", 13)];
const PROJECT = { title: "Pier Seven", logline: "", targetS: 19 };

test("cut: a spot's active take resolves to the store's file URL; a take the store lost is missing, never ok", () => {
  const spot: ScoreSpot = { ...SPOT, takeIds: ["st-x"], activeTakeId: "st-x" };
  const music = (cut: ReturnType<typeof deriveTimeline>) => cut.clips.find((c) => c.track === "music")!;

  const held = deriveTimeline({ projectId: "p-pier", project: PROJECT, frames: FRAMES, spots: [spot], storeTakeIds: new Set(["st-x"]) });
  expect([music(held).status, music(held).src]).toEqual(["ok", takeFileUrl("st-x")]);
  expect(music(held).src).not.toMatch(/^blob:/);

  const gone = deriveTimeline({ projectId: "p-pier", project: PROJECT, frames: FRAMES, spots: [spot], storeTakeIds: new Set() });
  expect([music(gone).status, music(gone).why, music(gone).src]).toEqual(["missing", "take gone from the store", undefined]);

  // The store not read (hosted posture, or the listing failed) is not "held".
  const unread = deriveTimeline({ projectId: "p-pier", project: PROJECT, frames: FRAMES, spots: [spot], storeTakeIds: null });
  expect(music(unread).status).toBe("missing");

  // A v1 spot with no pointer reads exactly as before.
  const v1 = deriveTimeline({ projectId: "p-pier", project: PROJECT, frames: FRAMES, spots: [SPOT], storeTakeIds: new Set(["st-x"]) });
  expect([music(v1).status, music(v1).why]).toEqual(["missing", "no take in hand"]);

  // A file dropped into THIS session still wins: it is what is playing now.
  const session = deriveTimeline({ projectId: "p-pier", project: PROJECT, frames: FRAMES, spots: [spot], storeTakeIds: new Set(["st-x"]), takes: { "spot-open": "blob:drop" } });
  expect(music(session).src).toBe("blob:drop");
});

test("the cue request carries the project's standing style block, the cue's own picture, and no client-typed duration", () => {
  const req = cueTakeRequest(CUE, "p-pier")!;
  expect(req).toMatchObject({ op: "cue", origin: "score", kind: "music", projectId: "p-pier", cueId: "spot-open" });
  expect(req.cue?.styleBlock).toEqual([...MUSIC_STYLE_BLOCK]);
  expect(req.cue?.picture).toEqual(PICTURE);
  expect(req.cue && "durS" in req.cue).toBe(false);
});
