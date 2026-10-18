import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readSpend } from "../../lib/ledger/v1/sources/spend.ts";
import { fileStore } from "../../lib/spend/fileStore.ts";

// A spend write (tmp + rename, retried on a thread-blocking busy-wait) racing the
// ledger source's read of the same class file: the read must not hold the file
// open across the rename, so every write lands and every read parses.

const ROUNDS = 50;
const CLS = "music-audio-s";
let dir = "";
let prior: string | undefined;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "spend-interleave-"));
  prior = process.env["SPEND_STORE_DIR"];
  process.env["SPEND_STORE_DIR"] = dir;
});
afterAll(() => {
  if (prior === undefined) delete process.env["SPEND_STORE_DIR"];
  else process.env["SPEND_STORE_DIR"] = prior;
  rmSync(dir, { recursive: true, force: true });
});

describe("spend write interleaved with the ledger source's read", () => {
  it(`${ROUNDS} rounds: every write lands, every read parses`, async () => {
    const store = fileStore<unknown>(CLS);
    for (let i = 0; i < ROUNDS; i++) {
      const write = store.transact((s) => {
        s.rows.push({ at: 1_000 + i, amount: 1, outcome: "served", basis: "requested", axes: {} });
        s.counters.booked++;
      });
      const read = readSpend(dir, undefined);
      const [, snap] = await Promise.all([write, read]);
      expect(snap.ok).toBe(true);
      if (snap.ok) expect(snap.value.skipped).toEqual([]);
    }
    const final = await readSpend(dir, undefined);
    expect(final.ok).toBe(true);
    if (!final.ok) return;
    const c = final.value.classes.find((x) => x.cls === CLS);
    expect(c?.rows.length).toBe(ROUNDS);
    expect(c?.counters.booked).toBe(ROUNDS);
  });
});
