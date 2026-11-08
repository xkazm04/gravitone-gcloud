// A YuE2 TAKE'S FACTS (lib/yue2/facts.ts, spark yue2-song-lab WP2) through the REAL sound store in a
// temp dir: a put round-trips and the same facts again is a no-op; other facts for a filed take is a
// conflict; a take the store does not hold refuses; a record its door refuses is skipped AND named,
// never crashing the read, and never overwritten; a corrupt file is refused, not emptied; a take and
// its facts filed together land together.
//
// SOUND_LEDGER_PATH is a temp file: pipeline/sound/ledger.json is git-tracked and another session owns it.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-yue2-facts-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  return dir;
});

import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createTake } from "../../lib/sound/takes.ts";
import { allYue2Facts, fileYue2Take, putYue2Facts, readYue2Facts, readYue2FactsFile, YUE2_FACTS_FILE } from "../../lib/yue2/facts.ts";
import { lyricsDigest, normaliseLyrics } from "../../lib/yue2/lyrics.ts";
import { facts, wav } from "./yue2-fixture.ts";

const FILE = path.join(ROOT, "sound", YUE2_FACTS_FILE);
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

async function take(name: string): Promise<string> {
  const { take: t } = await createTake({ kind: "music", provider: "local", origin: "import", op: "compose", title: name }, { bytes: wav(220 + name.length * 10), mime: "audio/wav", name: `${name}.wav` });
  return t.id;
}

describe("putYue2Facts / readYue2Facts", () => {
  it("round-trips, and the same facts again is the same answer with no second write", async () => {
    const id = await take("roundtrip");
    const f = facts();
    expect(await putYue2Facts(id, f)).toEqual({ ok: true, value: f });
    const before = readFileSync(FILE, "utf8");
    expect(await putYue2Facts(id, { ...f })).toEqual({ ok: true, value: f });
    expect(readFileSync(FILE, "utf8")).toBe(before);
    const read = await readYue2Facts([id, "st-nothere", "not an id!"]);
    expect(read).toEqual({ ok: true, value: { [id]: f } });
    const all = await allYue2Facts();
    expect(all.ok && all.value[id]).toEqual(f);
  });

  it("other facts for a filed take is a conflict, and the held facts stay", async () => {
    const id = await take("conflict");
    expect((await putYue2Facts(id, facts())).ok).toBe(true);
    const r = await putYue2Facts(id, facts({ condition: { cot: "full", seed: 4 } }));
    expect(r.ok ? "ok" : r.error.code).toBe("conflict");
    const read = await readYue2Facts([id]);
    expect(read.ok && read.value[id]?.condition).toEqual({ cot: "off", cfg: 1.5, seed: 4 });
  });

  it("refuses facts for a take the store does not hold, a malformed id, and facts outside the door", async () => {
    const missing = await putYue2Facts("st-0000000000", facts());
    expect(missing.ok ? "ok" : missing.error.code).toBe("not-found");
    const badId = await putYue2Facts("../x", facts());
    expect(badId.ok ? "ok" : badId.error.code).toBe("invalid");
    const id = await take("door");
    const bad = await putYue2Facts(id, facts({ lyricsDigest: "XYZ" }));
    expect(bad.ok ? "ok" : bad.error.code).toBe("invalid");
    const read = await readYue2Facts([id]);
    expect(read).toEqual({ ok: true, value: {} });
  });

  it("a record the door refuses is skipped and named, never crashing the read, and a put onto it is a conflict", async () => {
    const good = await take("good");
    const bad = await take("bad");
    expect((await putYue2Facts(good, facts())).ok).toBe(true);
    const held = JSON.parse(readFileSync(FILE, "utf8")) as { version: 1; facts: Record<string, unknown> };
    held.facts[bad] = { ...facts(), engine: "suno" };
    held.facts["st-gone000000"] = facts();
    writeFileSync(FILE, JSON.stringify(held));
    const read = await readYue2FactsFile();
    if (!read.ok) throw new Error(read.error.message);
    expect(read.value.facts[good]).toEqual(facts());
    expect(bad in read.value.facts).toBe(false);
    expect(read.value.skipped.map((s) => s.takeId)).toEqual([bad]);
    expect(read.value.skipped[0]?.reason).toMatch(/engine/);
    // A record of a take the store no longer holds is absent, not reported as bad.
    expect("st-gone000000" in read.value.facts).toBe(false);
    const put = await putYue2Facts(bad, facts());
    expect(put.ok ? "ok" : put.error.code).toBe("conflict");
    expect((JSON.parse(readFileSync(FILE, "utf8")) as { facts: Record<string, { engine: string }> }).facts[bad]?.engine).toBe("suno");
  });

  it("a corrupt file is refused, never emptied", async () => {
    const saved = readFileSync(FILE, "utf8");
    writeFileSync(FILE, "{ not json");
    const read = await readYue2Facts([await take("corrupt")]);
    expect(read.ok ? "ok" : read.error.code).toBe("internal");
    expect(readFileSync(FILE, "utf8")).toBe("{ not json");
    writeFileSync(FILE, JSON.stringify({ version: 2, facts: {} }));
    const v2 = await allYue2Facts();
    expect(v2.ok ? "ok" : v2.error.message).toMatch(/not version 1/);
    writeFileSync(FILE, saved);
  });
});

describe("fileYue2Take", () => {
  it("files the take and its facts under one lock", async () => {
    const f = facts({ condition: { cot: "off", seed: 9 } });
    const r = await fileYue2Take({ kind: "music", provider: "local", origin: "lab", op: "compose", title: "yue2 cot=off s9", prompt: f.style }, { bytes: wav(990), mime: "audio/wav", name: "s9.wav" }, f);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.created).toBe(true);
    expect(r.value.take.provider).toBe("local");
    expect(existsSync(path.join(ROOT, "sound", r.value.take.file!.path))).toBe(true);
    // The facts carry the sha256 of the bytes filed (S2), computed once here.
    const bytesSha = createHash("sha256").update(wav(990)).digest("hex");
    expect(r.value.facts).toEqual({ ...f, sha: bytesSha });
    expect(await readYue2Facts([r.value.take.id])).toEqual({ ok: true, value: { [r.value.take.id]: { ...f, sha: bytesSha } } });
    // A new take carries no verdict: the git-tracked ledger is never read or written.
    expect(existsSync(path.join(ROOT, "ledger.json"))).toBe(false);
  });

  it("facts outside the door file nothing", async () => {
    const before = readFileSync(path.join(ROOT, "sound", "takes.json"), "utf8");
    const r = await fileYue2Take({ kind: "music", title: "refused" }, { bytes: wav(1100), mime: "audio/wav", name: "refused.wav" }, facts({ durationS: -1 }));
    expect(r.ok ? "ok" : r.error.code).toBe("invalid");
    expect(readFileSync(path.join(ROOT, "sound", "takes.json"), "utf8")).toBe(before);
  });
});

describe("lyricsDigest", () => {
  it("one sheet however it was carried, another sheet when the words change", () => {
    const sheet = "[Verse]\nEarly morning, city humming\n\nCoffee in a paper cup";
    expect(lyricsDigest(sheet)).toMatch(/^[0-9a-f]{16}$/);
    expect(lyricsDigest(`  ${sheet.replace(/\n/g, "\r\n")}  \n\n\n`)).toBe(lyricsDigest(sheet));
    expect(normaliseLyrics("a  \n\n\n\nb")).toBe("a\n\nb");
    expect(lyricsDigest(sheet.replace("Coffee", "Tea"))).not.toBe(lyricsDigest(sheet));
  });
});
