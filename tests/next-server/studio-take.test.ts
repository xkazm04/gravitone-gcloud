// THE SUNO ADVISOR'S TAKE IN, FACTS OUT (spark suno-advisor WP1): POST /audio/studio/take
// (app/(studio)/audio/studio/take/route.ts) over the real sound store in a temp dir, the facts reader
// (lib/sound/suno/facts.ts), the studio port that shows them (app/(studio)/audio/studio/_port/ledger.ts)
// and the agent's inbox that reads the same facts (app/_server/mcp/tools/audioStudio.ts readInbox).
//
// The door fails closed and refuses, with the reason in words and no take filed, a file that is not
// audio, one over the cap and a session outside the door. The ANALYZE lane runs the real sidecar
// (pipeline/audio/sidecar.py analyze, librosa) on a generated click track at 120 bpm under an A minor
// triad, and asserts the tempo within 2 % and the key; it SKIPS, saying why, when doctor finds this
// box's Python unable to run analyze (librosa, and a numba that accepts its numpy). The port, inbox,
// taste and listen lanes run everywhere: they file a take with a stated analysis, no sidecar.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-studio-take-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "sound-ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import type { StudioListen } from "@gt/domain/audio.suno";
import { TASTE_EVENT, TASTE_SUBJECT, tasteEventKey } from "@gt/domain/audio.suno.schema";
import type { Actor } from "@gt/domain/event";
import { appendOnce } from "@gt/kernel/ingest";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import { POST } from "../../app/(studio)/audio/studio/take/route.ts";
import { TAKE_ROUTE } from "../../app/(studio)/audio/studio/_host/upload.ts";
import { appendSay } from "../../app/(studio)/audio/studio/_live/say.ts";
import { readLedger, readLedgerFacts } from "../../app/(studio)/audio/studio/_port/ledger.ts";
import { readInbox } from "../../app/_server/mcp/tools/audioStudio.ts";
import { ACCESS_SECRET_VAR, __resetRateLimit } from "../../lib/apiAuth.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { SIDECAR_SCRIPT, type AudioAnalysis } from "../../lib/audio/sidecar.ts";
import { factsOf, fileSunoTake, measuredOf, saveListened, sunoFactsPath, takeFactsOf, tasteProfile } from "../../lib/sound/suno/facts.ts";
import { MAX_UPLOAD_BYTES } from "../../lib/sound/takes.ts";

// The analyze lane spawns Python and librosa (a first run compiles numba's cache: ~26 s measured here).
vi.setConfig({ testTimeout: 120_000 });

const SOUND = path.join(ROOT, "sound");
const ENV = [ACCESS_SECRET_VAR, "PRINCIPAL_MODE", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const SESSION = "song-ab12-20261029";
const AT = "2026-10-29T10:00:00.000Z";

beforeAll(() => {
  for (const k of ENV) delete process.env[k];
  process.env[ACCESS_SECRET_VAR] = "take-secret";
});
afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
  for (const k of ENV) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const PY = process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");

/** null when this box's sidecar can run `analyze`, else why not (doctor's own words). */
function analyzeNotReady(): string | null {
  const r = spawnSync(PY, [SIDECAR_SCRIPT, "doctor", "--json"], { encoding: "utf8", timeout: 60_000, windowsHide: true });
  const last = (r.stdout ?? "").trim().split(/\r?\n/).at(-1) ?? "";
  try {
    const d = JSON.parse(last) as { ok?: boolean; missing?: string[]; errors?: Record<string, string>; verbs?: { analyze?: { missing?: string[] } } };
    if (d.ok !== true) return `doctor answered ${last}`;
    const lacking = [...(d.missing ?? []), ...(d.verbs?.analyze?.missing ?? [])];
    if (d.verbs?.analyze === undefined) return "doctor names no analyze verb";
    return lacking.length === 0 ? null : `${PY} cannot run analyze: ${lacking.map((m) => `${m} (${d.errors?.[m] ?? "did not import"})`).join(", ")}`;
  } catch {
    return `${PY} did not run the sidecar: ${(r.error?.message ?? r.stderr ?? "").trim().slice(-200)}`;
  }
}
const NOT_READY = analyzeNotReady();
if (NOT_READY !== null) console.warn(`studio-take analyze lane skipped: ${NOT_READY}`);

/** A 16-bit mono PCM WAV of `x`. */
function wav16(rate: number, x: Float32Array): Uint8Array<ArrayBuffer> {
  const data = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((x[i] ?? 0) * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([h, data]));
}

/** A click every beat at `bpm` over a quiet A minor triad (A3, C4, E4): a known tempo and a known key. */
function clickTrack(bpm: number, seconds: number, rate = 22_050): Uint8Array<ArrayBuffer> {
  const x = new Float32Array(Math.round(rate * seconds));
  const period = (60 / bpm) * rate;
  const len = Math.round(0.03 * rate);
  for (let k = 0; k * period < x.length - len; k++) {
    const at = Math.round(k * period);
    for (let i = 0; i < len; i++) x[at + i] = (x[at + i] ?? 0) + 0.6 * Math.exp(-i / (0.004 * rate)) * Math.sin((2 * Math.PI * 1500 * i) / rate);
  }
  for (let i = 0; i < x.length; i++) for (const f of [220, 261.63, 329.63]) x[i] = (x[i] ?? 0) + 0.08 * Math.sin((2 * Math.PI * f * i) / rate);
  return wav16(rate, x);
}

const URL_ = `http://127.0.0.1:3111${TAKE_ROUTE}`;
const AUTH = { authorization: "Bearer take-secret" };

function form(fields: Record<string, string>, file?: File): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (file !== undefined) f.set("file", file);
  return f;
}
const post = (body: FormData, headers: Record<string, string> = AUTH): Promise<Response> => {
  __resetRateLimit();
  return POST(new Request(URL_, { method: "POST", body, headers }));
};
const takesOnDisk = (): readonly { id: string; origin: string; provider: string; measured: { tempoBpm: number | null } | null }[] => {
  const file = path.join(SOUND, "takes.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { takes: { id: string; origin: string; provider: string; measured: { tempoBpm: number | null } | null }[] }).takes : [];
};
const wavFile = (bytes: Uint8Array<ArrayBuffer>, name = "suno-take.wav"): File => new File([bytes], name, { type: "audio/wav" });

function kernelStore(): Store {
  const k = openKernel(":memory:");
  if (!k.ok) throw k.error;
  return k.value.store;
}

/** A stated analysis: the facts a take is filed with when the sidecar is not the subject. */
const ANALYSIS: AudioAnalysis = {
  durationS: 184.2,
  analysisRate: 22050,
  tempo: { bpm: 96, trackerBpm: 95.7, alt: [192], beats: 290, method: "test" },
  key: { name: "A minor", strength: 0.42, correlation: 0.88, runnerUp: { name: "C major", correlation: 0.79 }, method: "test" },
  measure: { integratedLufs: -9.8, truePeakDb: -0.4, lra: 5.1, clippedSamples: 0, leadSilenceS: 0, tailSilenceS: 0.4, durationS: 184.2 },
};

describe("POST /audio/studio/take: the door", () => {
  it("fails closed: nothing presented is 401 and no take is filed", async () => {
    const before = takesOnDisk().length;
    const r = await post(form({ session: SESSION }, wavFile(clickTrack(120, 2))), {});
    expect(r.status).toBe(401);
    expect(takesOnDisk()).toHaveLength(before);
  });

  it("refuses a file that is not audio, saying so, and files nothing", async () => {
    const before = takesOnDisk().length;
    const r = await post(form({ session: SESSION }, new File([new TextEncoder().encode("not a song")], "notes.txt", { type: "text/plain" })));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe("notes.txt is not audio (content-type text/plain)");
    expect(takesOnDisk()).toHaveLength(before);
  });

  it("refuses a file over the cap, naming the cap, and files nothing", async () => {
    const before = takesOnDisk().length;
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1024)], "huge.wav", { type: "audio/wav" });
    const r = await post(form({ session: SESSION }, big));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/60 MB/);
    expect(takesOnDisk()).toHaveLength(before);
  });

  it("refuses a session, prompt id or clip outside the door, and an upload with no file", async () => {
    const bad = await post(form({ session: "Not A Session!" }, wavFile(clickTrack(120, 2))));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain("session");
    expect((await post(form({ session: SESSION, promptId: "Has Spaces" }, wavFile(clickTrack(120, 2))))).status).toBe(400);
    expect((await post(form({ session: SESSION, clip: "c" }, wavFile(clickTrack(120, 2))))).status).toBe(400);
    const none = await post(form({ session: SESSION }));
    expect(((await none.json()) as { error: string }).error).toContain("audio file");
  });
});

describe.skipIf(NOT_READY !== null)("POST /audio/studio/take: the real analyze", () => {
  it("files a click track at 120 bpm as a measured Suno take: tempo within 2 %, A minor, loudness, served href", async () => {
    const r = await post(form({ session: SESSION, promptId: "p-dusk-2", clip: "b" }, wavFile(clickTrack(120, 20))));
    const body = (await r.json()) as { takeId: string; facts: { takeId: string; durationS: number; href: string; promptId?: string; clip?: string; measured: { bpm?: number; bpmAlt?: number[]; key?: string; keyStrength?: number; lufs?: number; truePeakDb?: number } } };
    expect(r.status, JSON.stringify(body)).toBe(200);
    const { takeId, facts } = body;
    expect(facts.takeId).toBe(takeId);
    expect(facts.durationS).toBeCloseTo(20, 1);
    expect(facts.href).toBe(`/api/sound/takes/${takeId}/file`);
    expect(facts).toMatchObject({ promptId: "p-dusk-2", clip: "b" });
    const m = facts.measured;
    const near = (b: number | undefined): boolean => b !== undefined && Math.abs(b - 120) / 120 <= 0.02;
    expect(near(m.bpm) || (m.bpmAlt ?? []).some(near), `bpm ${m.bpm} alt ${JSON.stringify(m.bpmAlt)}`).toBe(true);
    expect(m.key).toBe("A minor");
    expect(m.keyStrength).toBeGreaterThan(0);
    expect(typeof m.lufs).toBe("number");
    expect(typeof m.truePeakDb).toBe("number");
    const filed = takesOnDisk().find((t) => t.id === takeId);
    expect(filed).toMatchObject({ origin: "suno-return", provider: "suno" });
    expect(filed?.measured?.tempoBpm).toBe(m.bpm);
    expect(Object.keys((JSON.parse(readFileSync(sunoFactsPath(), "utf8")) as { facts: object }).facts)).toContain(takeId);
    expect(await factsOf(takeId)).toEqual({ ok: true, value: facts });
  });

  it("refuses a file that claims to be audio and does not decode, in the decoder's words, filing nothing", async () => {
    const before = takesOnDisk().length;
    const r = await post(form({ session: SESSION }, new File([new TextEncoder().encode("RIFF but not really a wave")], "broken.wav", { type: "audio/wav" })));
    expect(r.ok).toBe(false);
    expect(((await r.json()) as { error: string }).error).toMatch(/^broken\.wav could not be measured: audio sidecar analyze: /);
    expect(takesOnDisk()).toHaveLength(before);
  });
});

describe("the facts reader", () => {
  it("states what was measured and omits what was not", () => {
    expect(measuredOf(ANALYSIS)).toEqual({ bpm: 96, bpmAlt: [192], key: "A minor", keyStrength: 0.42, lufs: -9.8, truePeakDb: -0.4, lra: 5.1 });
    expect(measuredOf({ ...ANALYSIS, tempo: null, key: null, measure: { ...ANALYSIS.measure, integratedLufs: null, truePeakDb: null, lra: null } })).toEqual({});
    expect(measuredOf({ ...ANALYSIS, tempo: { ...ANALYSIS.tempo!, alt: [] } })).not.toHaveProperty("bpmAlt");
  });

  it("answers facts only for takes it holds, and keeps a listen on one", async () => {
    const filed = await fileSunoTake({ bytes: clickTrack(100, 1), mime: "audio/wav", name: "dusk-a.wav" }, { session: SESSION, promptId: "p-dusk-1", clip: "a" }, ANALYSIS);
    expect(filed.ok).toBe(true);
    if (!filed.ok) return;
    const id = filed.value.takeId;
    expect(filed.value).toMatchObject({ name: "dusk-a.wav", durationS: 184.2, promptId: "p-dusk-1", clip: "a", measured: { bpm: 96, key: "A minor" } });
    expect(filed.value).not.toHaveProperty("listened");
    expect(Object.keys(await takeFactsOf([id, "st-nothere000", "../escape"]))).toEqual([id]);
    expect(await takeFactsOf([])).toEqual({});
    const missing = await factsOf("st-nothere000");
    expect(missing.ok ? "" : missing.error.code).toBe("not-found");

    const listen: StudioListen = { model: "stand-in", at: AT, standIn: true, genre: ["synthwave"], mood: ["dusky"], vocals: { heard: false }, instruments: [{ name: "pad", role: "bed", prominence: "background" }], sections: [{ name: "intro", startS: 0, endS: 12, says: "pads alone" }] };
    const kept = await saveListened(id, listen);
    expect(kept.ok && kept.value.listened).toEqual(listen);
    const again = await factsOf(id);
    expect(again.ok && again.value.listened?.genre).toEqual(["synthwave"]);
    const bad = await saveListened(id, { ...listen, instruments: [{ name: "", role: "x", prominence: "lead" }] });
    expect(bad.ok ? "" : bad.error.code).toBe("invalid");
    const nowhere = await saveListened("st-nothere000", listen);
    expect(nowhere.ok ? "" : nowhere.error.code).toBe("not-found");
  });
});

/** One `audio.taste` press, as the taste act files it. */
function taste(s: Store, op: "keep" | "drop", line: string, lean: "like" | "dislike", at: string): void {
  const r = s.tx((t) => appendOnce(t, { actor: OPERATOR, type: TASTE_EVENT, lane: "audio", key: tasteEventKey(op, line, at), subject: TASTE_SUBJECT, data: { line, lean, op } }));
  if (!r.ok) throw r.error;
}

describe("the studio port and the agent's inbox read the same facts", () => {
  it("the port carries takes[takeId] for a user turn's upload, the folded taste, and says what it could not read", async () => {
    const s = kernelStore();
    const filed = await fileSunoTake({ bytes: clickTrack(100, 1), mime: "audio/wav", name: "dusk-b.wav" }, { session: SESSION, promptId: "p-dusk-1", clip: "b" }, ANALYSIS);
    if (!filed.ok) throw filed.error;
    const id = filed.value.takeId;
    expect(appendSay(s, { session: SESSION, turn: { v: 1, id: "u-1", seq: 0, at: AT, from: "user", text: "b is close, drums too busy", verdict: { promptId: "p-dusk-1", clip: "b", keep: true, off: ["energy"] }, takeId: id } }, OPERATOR).ok).toBe(true);
    taste(s, "keep", "Analog pads", "like", "2026-10-29T10:01:00.000Z");
    taste(s, "keep", "busy hi-hats", "dislike", "2026-10-29T10:02:00.000Z");
    taste(s, "drop", "analog  PADS", "like", "2026-10-29T10:03:00.000Z");

    const r = await readLedgerFacts(s);
    expect(r.takes?.[id]).toEqual(filed.value);
    expect(r.taste?.map((t) => [t.line, t.lean])).toEqual([["busy hi-hats", "dislike"]]);
    expect(r.note).toBeUndefined();
    expect(readLedger(s).taste).toEqual(r.taste);
    expect(tasteProfile(s)).toEqual({ ok: true, value: r.taste });

    // A take a turn names that this server does not hold, and a taste event its door refuses: both said.
    expect(appendSay(s, { session: SESSION, turn: { v: 1, id: "u-2", seq: 1, at: AT, from: "user", text: "here is a", takeId: "st-gone000000" } }, OPERATOR).ok).toBe(true);
    const w = s.tx((t) => appendOnce(t, { actor: OPERATOR, type: TASTE_EVENT, lane: "audio", key: "audio-taste:keep-bad-1", subject: TASTE_SUBJECT, data: { line: "", lean: "meh", op: "keep" } }));
    if (!w.ok) throw w.error;
    const said = await readLedgerFacts(s);
    expect(said.takes?.["st-gone000000"]).toBeUndefined();
    expect(said.note).toContain("1 uploaded take is not on this server: st-gone000000.");
    expect(said.note).toContain("1 taste event could not be read.");
    expect(said.taste).toHaveLength(1);
  });

  it("audio_inbox's state carries the session's uploaded takes and the taste profile", async () => {
    const s = kernelStore();
    const filed = await fileSunoTake({ bytes: clickTrack(100, 1), mime: "audio/wav", name: "dusk-c.wav" }, { session: SESSION }, ANALYSIS);
    if (!filed.ok) throw filed.error;
    const id = filed.value.takeId;
    expect(appendSay(s, { session: SESSION, turn: { v: 1, id: "u-1", seq: 0, at: AT, from: "user", text: "the take", takeId: id } }, OPERATOR).ok).toBe(true);
    taste(s, "keep", "warm tape hiss", "like", "2026-10-29T10:01:00.000Z");
    const r = await readInbox(s, { session: SESSION });
    if (!r.ok) throw r.error;
    const state = r.value["state"] as { takes?: Record<string, unknown>; taste?: { line: string }[]; takesNote?: string };
    expect(state.takes?.[id]).toEqual(filed.value);
    expect(state.taste?.map((t) => t.line)).toEqual(["warm tape hiss"]);
    expect(state.takesNote).toBeUndefined();
  });
});
