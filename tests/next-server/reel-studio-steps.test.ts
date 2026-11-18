// THE /reels STEPS' WRITES AND ACTS (spark reel-studio WP4): lib/reel/studio.ts over a temp reels root (a new
// reel, the data stop kept and sent back, the release words), the idea form's mirror of parseIdea's limits, the
// steps' state reading (app/(studio)/reels/[slug]/_steps/view.ts), and the Server Actions with the session and the
// launch door stubbed: live refused under GRAVITONE_DRY_ONLY=1 before the door is asked, the seat's inputs read
// from the records, and a verdict always the operator's, its round read against the subject it names.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-reel-steps-"));
  process.env["REELS_STORE_DIR"] = path.join(dir, "reels");
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

const launched: { kind: string; slug: string; opts: Record<string, unknown> }[] = [];
const decided: { slug: string; key: string; v: Record<string, unknown> }[] = [];

const measured: string[] = [];
vi.mock("../../lib/sound/suno/measure.ts", () => ({
  measureAndFile: async (file: { name: string }, from: { session: string }) => {
    measured.push(`${from.session}:${file.name}`);
    return { ok: true, value: { takeId: "tk-1" } };
  },
}));
vi.mock("../../app/_server/principal.ts", () => ({ principal: async () => ({ kind: "firebase", uid: "u-7", authTime: 0, exp: 0 }) }));
vi.mock("../../lib/producers/reel.ts", () => ({
  REEL_JOB_KINDS: ["reel-data", "reel-author", "reel-render", "reel-release"],
  launchReelJob: async (kind: string, slug: string, opts: Record<string, unknown>) => {
    launched.push({ kind, slug, opts });
    return { ok: true, value: { kind: "receipt", receipt: { token: "t" } } };
  },
}));
vi.mock("../../lib/reel/decide.ts", () => ({
  decideReelStop: async (slug: string, key: string, v: Record<string, unknown>) => {
    decided.push({ slug, key, v });
    return { ok: true, value: { recorded: "written" } };
  },
}));

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { POST as bedPost } from "../../app/(studio)/reels/[slug]/bed/route.ts";
import { ACCESS_SECRET_VAR } from "../../lib/apiAuth.ts";
import { decideAction } from "../../app/(studio)/reels/_actions/decide.ts";
import { launchReelAction } from "../../app/(studio)/reels/_actions/steps.ts";
import { IDEA_LIMITS, slugOf } from "../../app/(studio)/reels/new/slug.ts";
import { openStepOf, redoPins, stepState } from "../../app/(studio)/reels/[slug]/_steps/view.ts";
import type { ReelDetail } from "../../app/(studio)/reels/_port/types.ts";
import { parseIdea } from "../../lib/reel/state.ts";
import { readVerdicts, recordVerdict, reelDir } from "../../lib/reel/store.ts";
import { acceptTable, createReel, readPublish, savePublish, sendBackTable } from "../../lib/reel/studio.ts";

const IDEA = { title: "Who led the box office", hook: "Which studio owned the summer?", path: "Paramount to Disney through Pixar, Marvel and Lucasfilm, 1977 to 2025, with the 2019 peak." };
const sha = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");

/** A reel with a table on disk, as the data job leaves it. */
async function withTable(slug: string): Promise<string> {
  const made = await createReel(slug, IDEA);
  expect(made.ok).toBe(true);
  const dir = reelDir(slug);
  const table = JSON.stringify({ v: 1, unit: "USD" });
  writeFileSync(path.join(dir, "table.json"), table);
  const state = JSON.parse(readFileSync(path.join(dir, "reel.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(path.join(dir, "reel.json"), JSON.stringify({ ...state, stage: "data", tableSha: "x".repeat(64) }));
  return sha(table);
}

beforeAll(() => mkdirSync(path.join(ROOT, "reels"), { recursive: true }));

describe("a new reel", () => {
  it("is made from its idea and refused a second time", async () => {
    const r = await createReel("box-office", IDEA);
    expect(r.ok && r.value.stage).toBe("idea");
    const again = await createReel("box-office", IDEA);
    expect(!again.ok && again.error.code).toBe("conflict");
  });

  it("answers parseIdea's own sentence and refuses a slug that is not one", async () => {
    const bad = await createReel("no-q", { ...IDEA, hook: "Which studio owned the summer" });
    expect(!bad.ok && bad.error.message).toBe(parseIdea({ ...IDEA, hook: "Which studio owned the summer" }));
    expect((await createReel("a:b", IDEA)).ok).toBe(false);
  });

  it("the form mirrors parseIdea's limits and suggests a slug", () => {
    expect(typeof parseIdea({ ...IDEA, title: "t".repeat(IDEA_LIMITS.title) })).toBe("object");
    expect(typeof parseIdea({ ...IDEA, title: "t".repeat(IDEA_LIMITS.title + 1) })).toBe("string");
    expect(typeof parseIdea({ ...IDEA, hook: `${"h".repeat(IDEA_LIMITS.hook - 1)}?` })).toBe("object");
    expect(typeof parseIdea({ ...IDEA, path: "p".repeat(IDEA_LIMITS.path - 1) })).toBe("string");
    expect(slugOf("  Who Led the Box Office, 1977–2025!  ")).toBe("who-led-the-box-office-1977-2025");
  });
});

describe("the data stop", () => {
  it("keeps the table it shows, once", async () => {
    const of = await withTable("kept");
    expect(await acceptTable("kept")).toEqual({ ok: true, value: "written" });
    const v = (await readVerdicts(reelDir("kept"))).stops.data;
    expect(v).toMatchObject({ verdict: "keep", by: "operator", of, round: 1 });
    expect(await acceptTable("kept")).toEqual({ ok: true, value: "same" });
  });

  it("refuses a table that is not there and a send-back with no note", async () => {
    await createReel("bare", IDEA);
    expect(!(await acceptTable("bare")).ok).toBe(true);
    await withTable("back");
    const none = await sendBackTable("back", "  ");
    expect(!none.ok && none.error.code).toBe("invalid");
    expect((await sendBackTable("back", "the 1990s are missing")).ok).toBe(true);
    expect((await readVerdicts(reelDir("back"))).stops.data).toMatchObject({ verdict: "reject", note: "the 1990s are missing" });
  });
});

describe("the release words", () => {
  it("are refused before a film and written after one", async () => {
    await createReel("words", IDEA);
    expect(!(await savePublish("words", { title: "T", description: "", tags: [] })).ok).toBe(true);
    const file = path.join(reelDir("words"), "reel.json");
    const state = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...state, film: { frames: 3000, renders: {}, copies: {} } }));
    expect((await savePublish("words", { title: "x".repeat(101), description: "", tags: [] })).ok).toBe(false);
    expect((await savePublish("words", { title: " Box office ", description: "d", tags: ["data", " data ", ""] })).ok).toBe(true);
    expect(await readPublish("words")).toEqual({ ok: true, value: { title: "Box office", description: "d", tags: ["data"] } });
  });
});

describe("the launch act", () => {
  it("refuses live under GRAVITONE_DRY_ONLY=1 before the door is asked", async () => {
    const was = process.env["GRAVITONE_DRY_ONLY"];
    process.env["GRAVITONE_DRY_ONLY"] = "1";
    launched.length = 0;
    const r = await launchReelAction({ kind: "reel-render", slug: "kept", mode: "live" });
    expect(!r.ok && r.error.error).toContain("GRAVITONE_DRY_ONLY=1");
    expect(launched).toEqual([]);
    const dry = await launchReelAction({ kind: "reel-render", slug: "kept", mode: "dry" });
    expect(dry.ok).toBe(true);
    expect(launched[0]?.opts).toMatchObject({ mode: "dry", dryOnly: true, actor: { kind: "operator", id: "u-7" } });
    if (was === undefined) delete process.env["GRAVITONE_DRY_ONLY"];
    else process.env["GRAVITONE_DRY_ONLY"] = was;
  });

  it("hands the seat the sent-back note and the redo pins in time order, from the records", async () => {
    launched.length = 0;
    await launchReelAction({ kind: "reel-data", slug: "back", mode: "dry" });
    expect(launched[0]?.opts["note"]).toBe("the 1990s are missing");
    const pins = [{ t: 40, reasons: ["pacing"], text: "slow" }, { t: 5, reasons: ["hook"], text: "late" }];
    await recordVerdict(reelDir("kept"), "film", { verdict: "reject", reasons: ["pacing"], pins, by: "operator", at: "2026-11-18T10:00:00.000Z", of: "f".repeat(64), round: 1 });
    await launchReelAction({ kind: "reel-author", slug: "kept", mode: "dry" });
    expect((launched[1]?.opts["notes"] as { t: number }[]).map((p) => p.t)).toEqual([5, 40]);
  });
});

describe("the verdict act", () => {
  it("is the operator's, at the round its subject reads", async () => {
    decided.length = 0;
    const r = await decideAction({ slug: "kept", key: "film", verdict: "keep", reasons: [], of: "f".repeat(64) });
    expect(r.ok).toBe(true);
    // The film stop holds round 1 for this sha: the same subject is round 1 again (the writer answers same or a clash).
    expect(decided[0]?.v).toMatchObject({ by: "operator", round: 1, verdict: "keep" });
    await decideAction({ slug: "kept", key: "film", verdict: "keep", reasons: [], of: "e".repeat(64) });
    expect(decided[1]?.v["round"]).toBe(2);
  });

  it("refuses a dropped release", async () => {
    const r = await decideAction({ slug: "kept", key: "release", verdict: "drop", reasons: [], of: "f".repeat(64) });
    expect(!r.ok && r.error.code).toBe("invalid");
  });
});

describe("the steps' states", () => {
  const base = { slug: "s", title: "t", hook: "h?", stage: "data", strip: [], updatedAt: "", idea: IDEA, media: {}, verdicts: {}, reasons: { film: [], release: [] }, jobs: [] } as unknown as ReelDetail;

  it("opens the stage's step and reads a running job over what was made", () => {
    expect(openStepOf("redo")).toBe("author");
    expect(openStepOf("dropped")).toBeUndefined();
    expect(stepState("data", base)).toBe("empty");
    expect(stepState("data", { ...base, jobs: [{ kind: "reel-data", jobId: "j", state: "running" }] })).toBe("running");
    expect(stepState("data", { ...base, jobs: [{ kind: "reel-data", jobId: "j", state: "failed", error: "seat unavailable" }] })).toBe("failed");
  });

  it("drops the redo pins once pages were written after the redo", () => {
    const verdicts = { film: { verdict: "reject", reasons: [], at: "2026-11-18T10:00:00Z", round: 1, current: true, pins: [{ t: 9, reasons: [], text: "b" }, { t: 1, reasons: [], text: "a" }] } } as ReelDetail["verdicts"];
    const film = { frames: 1, renders: {}, copies: {} } as unknown as NonNullable<ReelDetail["film"]>;
    expect(redoPins({ verdicts, film }).map((p) => p.t)).toEqual([1, 9]);
    expect(redoPins({ verdicts, film: { ...film, authoredAt: "2026-11-18T11:00:00Z" } })).toEqual([]);
  });
});

describe("the bed upload", () => {
  const ENV = [ACCESS_SECRET_VAR, "PRINCIPAL_MODE", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE"];
  const post = async (slug: string, fields: Record<string, string>, file?: { name: string; bytes: number }, auth = true): Promise<{ status: number; body: Record<string, unknown> }> => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    if (file !== undefined) form.set("file", new File([new Uint8Array(file.bytes)], file.name, { type: "audio/mpeg" }));
    const res = await bedPost(new Request(`http://localhost/reels/${slug}/bed`, { method: "POST", body: form, headers: auth ? { authorization: "Bearer bed-secret" } : {} }), { params: Promise.resolve({ slug }) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it("files nothing without its door, its style or an audio extension, and attaches only under a rendered film", async () => {
    const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
    for (const k of ENV) delete process.env[k];
    process.env[ACCESS_SECRET_VAR] = "bed-secret";
    try {
      measured.length = 0;
      expect((await post("kept", { style: "synthwave" }, { name: "b.mp3", bytes: 64 }, false)).status).toBe(401);
      expect((await post("kept", {}, { name: "b.mp3", bytes: 64 })).status).toBe(400);
      expect((await post("kept", { style: "synthwave" }, { name: "b.txt", bytes: 64 })).status).toBe(400);
      expect(measured).toEqual([]);
      const r = await post("kept", { style: "synthwave", model: "v5.5" }, { name: "b.mp3", bytes: 64 });
      expect(r.body["error"]).toContain("the desktop film is not rendered yet");
      expect(measured).toEqual([]);
      const file = path.join(reelDir("kept"), "reel.json");
      const state = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      writeFileSync(file, JSON.stringify({ ...state, film: { frames: 3000, renders: { desktop: { file: "film-desktop.mp4", frames: 3000, seconds: 100, bytes: 1, sha: "a".repeat(64), renderedAt: "2026-11-18T09:00:00.000Z" } }, copies: {} } }));
      const filed = await post("kept", { style: "synthwave" }, { name: "b.mp3", bytes: 64 });
      expect(measured).toEqual(["reel-kept:b.mp3"]);
      // The mocked take has no file in the temp sound store: the attach answers in the store's words.
      expect(filed.status).toBeGreaterThanOrEqual(400);
    } finally {
      for (const k of ENV) {
        const v = saved[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
