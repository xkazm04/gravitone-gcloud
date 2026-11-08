// A TAKE'S SHA, CACHED AT FILING (lib/yue2/sha.ts + facts.ts fileYue2Take, spark yue2-song-lab S2
// WP-C) through the REAL sound store in a temp dir: fileYue2Take stores the sha256 of the bytes it
// files as `facts.sha`; takeSha answers from it, and proposePairs over 20 such takes reads NO audio
// file. Facts filed before S2 (no sha) still read, and takeSha falls back to hashing the stored file.
//
// HOW READS ARE COUNTED: a spy on node:fs/promises readFile (vi.mock wraps the real one), so every
// read in the run - the sound store's, the facts file's, takeSha's - passes through it; a read is an
// AUDIO read when its path is not a .json file. The fallback case also runs takeShaWith over an
// injected counting reader.
//
// Every store is temp: SOUND_STORE_DIR, SOUND_LEDGER_PATH and an in-memory kernel.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-yue2-sha-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  return dir;
});

const reads = vi.hoisted(() => [] as string[]);

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  const readFile = ((...args: Parameters<typeof real.readFile>) => {
    reads.push(String(args[0]));
    return real.readFile(...args);
  }) as typeof real.readFile;
  return { ...real, default: { ...real, readFile }, readFile };
});

import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { SongScores, Yue2TakeFacts } from "@gt/domain/audio.yue2";
import { openKernel } from "@gt/kernel/kernel";

import { readTakes } from "../../lib/sound/store.ts";
import type { SoundTake } from "../../lib/sound/types.ts";
import { proposePairs } from "../../lib/yue2/ab.ts";
import { fileYue2Take, readYue2Facts, YUE2_FACTS_FILE } from "../../lib/yue2/facts.ts";
import { putSongScores } from "../../lib/yue2/scores.ts";
import { takeSha, takeShaWith } from "../../lib/yue2/sha.ts";
import { facts, wav } from "./yue2-fixture.ts";

const FACTS_FILE = path.join(ROOT, "sound", YUE2_FACTS_FILE);
const AT = "2026-11-04T10:00:00.000Z";
const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const audioReads = (): string[] => reads.filter((p) => !p.endsWith(".json"));

const kernel = (() => {
  const k = openKernel(":memory:");
  if (!k.ok) throw new Error(k.error.message);
  return k.value;
})();
afterAll(() => {
  kernel.close();
  rmSync(ROOT, { recursive: true, force: true });
});

const ids: string[] = [];
const bytesOf = new Map<string, Uint8Array>();

// Twenty takes of one sheet and one condition, each with its own tone, filed with a score row so
// best-of-n has pairs to propose.
for (let seed = 1; seed <= 20; seed++) {
  const bytes = wav(200 + seed * 37);
  const r = await fileYue2Take({ kind: "music", provider: "local", origin: "lab", op: "compose", title: `s${seed}` }, { bytes, mime: "audio/wav", name: `s${seed}.wav` }, facts({ condition: { cot: "off", cfg: 1.5, seed } }));
  if (!r.ok) throw new Error(r.error.message);
  ids.push(r.value.take.id);
  bytesOf.set(r.value.take.id, bytes);
  const row: SongScores = { sha: sha256(bytes), scorerVersion: 1, scoredAt: AT, wer: 0.05, songEval: { coherence: seed / 4, musicality: 4, memorability: 4, clarity: 4, naturalness: 4 } };
  const put = putSongScores(kernel.store, row);
  if (!put.ok) throw new Error(put.error.message);
}

beforeEach(() => {
  reads.length = 0;
});

async function takeById(id: string): Promise<SoundTake> {
  const t = (await readTakes()).takes.find((x) => x.id === id);
  if (t === undefined) throw new Error(`no take ${id}`);
  return t;
}

describe("the sha filed with the facts", () => {
  it("fileYue2Take stores the sha256 of the bytes it filed", async () => {
    const f = await readYue2Facts(ids);
    if (!f.ok) throw new Error(f.error.message);
    for (const id of ids) expect(f.value[id]?.sha).toBe(sha256(bytesOf.get(id)!));
  });

  it("proposePairs over 20 takes with cached shas reads no audio file", async () => {
    const r = await proposePairs(kernel.store, "best-of-n", 10);
    if (!r.ok) throw new Error(r.error.message);
    // The scores were found by the cached shas: the best seed is paired with the next two.
    // (The desk orders its proposals by take id, so the pairs are compared as a set.)
    const pairs = r.value.map((p) => `${p.takeA}|${p.takeB}`).sort();
    expect(pairs).toEqual([`${ids[19]}|${ids[18]}`, `${ids[19]}|${ids[17]}`].sort());
    expect(reads.length).toBeGreaterThan(0); // the spy sees the run's reads (the store's json files)
    expect(audioReads()).toEqual([]);
  });

  it("takeSha answers from the facts without reading the file", async () => {
    const t = await takeById(ids[0]!);
    expect(await takeSha(t)).toEqual({ ok: true, value: sha256(bytesOf.get(ids[0]!)!) });
    expect(audioReads()).toEqual([]);
  });
});

describe("facts filed before S2 (no sha)", () => {
  it("still read, and takeSha falls back to hashing the stored file", async () => {
    const saved = readFileSync(FACTS_FILE, "utf8");
    try {
      const file = JSON.parse(saved) as { version: 1; facts: Record<string, Yue2TakeFacts> };
      const { sha: _sha, ...old } = file.facts[ids[0]!]!;
      file.facts[ids[0]!] = old;
      writeFileSync(FACTS_FILE, JSON.stringify(file));

      const f = await readYue2Facts([ids[0]!]);
      expect(f.ok && f.value[ids[0]!]).toEqual(old);
      const t = await takeById(ids[0]!);
      reads.length = 0;
      expect(await takeSha(t)).toEqual({ ok: true, value: sha256(bytesOf.get(ids[0]!)!) });
      expect(audioReads()).toHaveLength(1);

      // The same through an injected counting reader.
      let counted = 0;
      const sha = takeShaWith({
        facts: readYue2Facts,
        readBytes: async (abs) => {
          counted++;
          return new Uint8Array(readFileSync(abs));
        },
      });
      expect(await sha(t)).toEqual({ ok: true, value: sha256(bytesOf.get(ids[0]!)!) });
      expect(counted).toBe(1);
      expect(await sha(await takeById(ids[1]!))).toEqual({ ok: true, value: sha256(bytesOf.get(ids[1]!)!) });
      expect(counted).toBe(1);

      // Re-filing the same bytes and words onto a pre-S2 record is that record, not a conflict.
      const again = await fileYue2Take({ id: ids[0]!, kind: "music", provider: "local", origin: "lab", op: "compose", title: "s1" }, { bytes: bytesOf.get(ids[0]!)!, mime: "audio/wav", name: "s1.wav" }, facts({ condition: { cot: "off", cfg: 1.5, seed: 1 } }));
      expect(again.ok ? again.value.facts : again.error.message).toEqual(old);
    } finally {
      writeFileSync(FACTS_FILE, saved);
    }
  });
});
