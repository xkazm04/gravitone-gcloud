// THE RELEASE ACTS (spark studio-to-release WP1): app/(studio)/audio/_release/actsCore.ts's three bodies, through their
// input doors, over the REAL sound store and a kernel store in a temp dir. "Release this" keeps, finalizes and labels
// the take and makes the record in one act (its Suno facts seeding the rights record); a second press answers the same
// release; the shelf's "new" makes a release from kept takes only; an edit, an accept and a dismiss each land by
// compare-and-swap with one event, a stale version writes nothing; the edit door refuses a patch the wizard could not
// send; the real port reads the stored records.
//
// SOUND_LEDGER_PATH is a temp file: pipeline/sound/ledger.json is git-tracked and every kept-take patch re-syncs its row.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-release-acts-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "sound-ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Actor } from "@gt/domain/event";
import { parseAt } from "@gt/domain/door";

import { applyBody, applyInput, createBody, createInput, releaseThisBody, releaseThisInput } from "../../app/(studio)/audio/_release/actsCore.ts";
import { realPort } from "../../app/(studio)/audio/_release/_port/real.ts";
import { closeKernel, kernel } from "../../lib/kernelStore.ts";
import { proposeToRelease } from "../../lib/release/store.ts";
import type { SoundTake } from "../../lib/sound/types.ts";

vi.setConfig({ testTimeout: 30_000 });

const SOUND = path.join(ROOT, "sound");
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AGENT: Actor = { kind: "agent", id: "studio-agent" };

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const take = (id: string, over: Partial<SoundTake> = {}): SoundTake => ({
  id,
  kind: "music",
  title: `Take ${id}`,
  provider: "suno",
  op: "manual",
  origin: "suno-return",
  technique: [],
  prompt: `prompt ${id}`,
  negative: null,
  terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
  tempoBpm: null,
  key: null,
  durationS: 182,
  loop: null,
  file: null,
  peaks: null,
  measured: null,
  ratings: {},
  verdict: "unjudged",
  reasons: [],
  note: null,
  stage: null,
  group: null,
  label: null,
  parentId: null,
  huntId: null,
  nodeId: null,
  songId: null,
  plan: null,
  referenceTrackId: null,
  promptRound: null,
  draftId: null,
  variation: null,
  editModes: null,
  fileName: null,
  projectId: null,
  cueId: null,
  createdAt: "2026-11-17T08:00:00.000Z",
  judgedAt: null,
  finalizedAt: null,
  ...over,
});

const FACTS = { "night-drive-a": { session: "night-drive", durationS: 182, measured: { bpm: 98 }, analyzedAt: "2026-11-17T08:00:00.000Z", sunoClipId: "clip-0001" } };

beforeEach(() => {
  rmSync(SOUND, { recursive: true, force: true });
  mkdirSync(SOUND, { recursive: true });
  const takes = [
    take("night-drive-a", { title: "Night Drive" }),
    take("shelf-kept", { title: "Room Enough", verdict: "kept", stage: "pending", judgedAt: "2026-11-16T00:00:00.000Z" }),
    take("shelf-unjudged", { title: "Not Yet" }),
  ];
  writeFileSync(path.join(SOUND, "takes.json"), JSON.stringify({ version: 1, takes }));
  writeFileSync(path.join(SOUND, "groups.json"), JSON.stringify({ version: 1, groups: { music: [], sfx: [] } }));
  writeFileSync(path.join(SOUND, "suno-facts.json"), JSON.stringify({ version: 1, facts: FACTS }));
});

const onDisk = (id: string): SoundTake | undefined => (JSON.parse(readFileSync(path.join(SOUND, "takes.json"), "utf8")) as { takes: SoundTake[] }).takes.find((t) => t.id === id);
function held<T>(schema: Parameters<typeof parseAt>[1], raw: unknown): T {
  const r = parseAt("test", schema, raw);
  if (!r.ok) throw r.error;
  return r.value as T;
}
const events = (id: string): string[] => {
  const k = kernel();
  if (!k.ok) throw k.error;
  const r = k.value.store.read((x) => x.all("SELECT type FROM events WHERE subject_kind = 'release' AND subject_id = ? ORDER BY seq", id));
  if (!r.ok) throw r.error;
  return r.value.map((e) => String(e["type"]));
};
const answer = <T,>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

describe("Release this", () => {
  it("keeps, finalizes and labels the take, and creates the record from it", async () => {
    const out = answer(await releaseThisBody(held(releaseThisInput, { takeId: "night-drive-a", sessionId: "night-drive" }), OPERATOR));
    expect(out.stale).toBe(false);
    const { record } = out;
    expect(record).toMatchObject({ version: 1, sessionId: "night-drive", pending: [] });
    expect(record.release.id).toMatch(/^rel-[0-9a-f]{12}$/);
    expect(record.release).toMatchObject({ title: "Night Drive", status: "draft", artist: "" });
    expect(record.release.tracks.map((t) => [t.takeId, t.title, t.durationS])).toEqual([["night-drive-a", "Night Drive", 182]]);
    // The Suno facts seed the rights record; what they do not carry stays null.
    expect(record.release.tracks[0]?.rights).toEqual({ vendor: "suno", model: null, planTier: null, generatedAt: null, briefDigest: null, reference: "suno:clip-0001", licence: "unknown" });
    expect(onDisk("night-drive-a")).toMatchObject({ verdict: "kept", stage: "finalized", label: "Night Drive" });
    expect(onDisk("night-drive-a")?.finalizedAt).not.toBeNull();
    expect(events(record.release.id)).toEqual(["release.created"]);

    const again = answer(await releaseThisBody(held(releaseThisInput, { takeId: "night-drive-a", sessionId: "night-drive" }), OPERATOR));
    expect(again.record).toEqual(record);
    expect(events(record.release.id)).toEqual(["release.created"]);

    const listed = await realPort.read();
    expect(listed.source).toBe("real");
    expect(listed.records.map((r) => r.release.id)).toContain(record.release.id);
  });

  it("refuses an agent, and keeps nothing when it does", async () => {
    const r = await releaseThisBody(held(releaseThisInput, { takeId: "night-drive-a", sessionId: "night-drive" }), AGENT);
    expect(r.ok ? "ok" : r.error.code).toBe("refused");
    expect(onDisk("night-drive-a")).toMatchObject({ verdict: "unjudged", stage: null, label: null });
  });

  it("an unknown take is refused, nothing kept", async () => {
    const r = await releaseThisBody(held(releaseThisInput, { takeId: "no-such-take", sessionId: null }), OPERATOR);
    expect(r.ok ? "ok" : `${r.error.code}: ${r.error.message}`).toBe("refused: no take no-such-take");
  });
});

describe("a release from the shelf", () => {
  it("is made from kept takes only, with no session, keeping nothing new", async () => {
    const refused = await createBody(held(createInput, { takeIds: ["shelf-kept", "shelf-unjudged"] }), OPERATOR);
    expect(refused.ok ? "ok" : `${refused.error.code}: ${refused.error.message}`).toBe("refused: take shelf-unjudged is unjudged; a release is made from kept takes");
    const { record } = answer(await createBody(held(createInput, { takeIds: ["shelf-kept"] }), OPERATOR));
    expect(record.sessionId).toBeNull();
    expect(record.release.tracks[0]?.rights.reference).toBeNull();
    expect(onDisk("shelf-kept")).toMatchObject({ verdict: "kept", stage: "pending", label: null });
  });
});

describe("applying an act", () => {
  it("edits, accepts and dismisses by compare-and-swap, one event each; a stale version writes nothing", async () => {
    const { record } = answer(await createBody(held(createInput, { takeIds: ["shelf-kept"] }), OPERATOR));
    const id = record.release.id;
    const edit = { kind: "edit", edit: { type: "patch", id, fields: { title: "Room Enough (Single)", genre: { primary: "Ambient", secondary: null } } } };
    const edited = answer(await applyBody(held(applyInput, { id, version: 1, act: edit }), OPERATOR));
    expect(edited.stale).toBe(false);
    expect(edited.record.version).toBe(2);
    expect(edited.record.release.genre.primary).toBe("Ambient");

    const stale = answer(await applyBody(held(applyInput, { id, version: 1, act: { kind: "edit", edit: { type: "patch", id, fields: { title: "lost" } } } }), OPERATOR));
    expect(stale).toEqual({ record: edited.record, stale: true });

    const proposed = await proposeToRelease({ id, version: 2, proposals: [{ path: "sleevePrompt", value: "rain on glass", source: "verse one" }, { path: "track:1.songwriters", value: ["Jane Doe"], source: "turn 2" }], turnId: null, by: AGENT });
    if (!proposed.ok) throw proposed.error;
    const [a, b] = proposed.value.record.pending;
    const accepted = answer(await applyBody(held(applyInput, { id, version: 3, act: { kind: "accept", proposalIds: [a?.id] } }), OPERATOR));
    expect(accepted.record.release.sleevePrompt).toBe("rain on glass");
    const dismissed = answer(await applyBody(held(applyInput, { id, version: 4, act: { kind: "dismiss", proposalIds: [b?.id] } }), OPERATOR));
    expect(dismissed.record.pending).toEqual([]);
    expect(dismissed.record.release.tracks[0]?.songwriters).toEqual([]);

    const scheduled = answer(await applyBody(held(applyInput, { id, version: 5, act: { kind: "edit", edit: { type: "schedule", id } } }), OPERATOR));
    expect(scheduled.record.release.status).toBe("scheduled");
    expect(events(id)).toEqual(["release.created", "release.edited", "release.proposed", "release.accepted", "release.dismissed", "release.scheduled"]);
  });

  it("the edit door refuses a patch the wizard could not send, and an added track is read from the sound store", async () => {
    const { record } = answer(await createBody(held(createInput, { takeIds: ["shelf-kept"] }), OPERATOR));
    const id = record.release.id;
    expect(parseAt("test", applyInput, { id, version: 1, act: { kind: "edit", edit: { type: "patch", id, fields: { status: "published" } } } }).ok).toBe(false);
    const forged = { takeId: "shelf-unjudged", title: "Forged", durationS: 9, audioHref: "https://elsewhere.example/x.mp3", provider: "suno", label: null, lufs: null, truePeakDb: null };
    const r = await applyBody(held(applyInput, { id, version: 1, act: { kind: "edit", edit: { type: "addTrack", id, take: forged } } }), OPERATOR);
    expect(r.ok ? "ok" : `${r.error.code}: ${r.error.message}`).toBe("refused: take shelf-unjudged is unjudged; a release is made from kept takes");
    const other = await applyBody(held(applyInput, { id, version: 1, act: { kind: "edit", edit: { type: "schedule", id: "rel-ffffffffffff" } } }), OPERATOR);
    expect(other.ok ? "ok" : other.error.code).toBe("invalid");
  });
});
