// THE COVER BRIEF'S ACT (cover brief, WP-B): app/(studio)/audio/_cover/actsCore.ts briefCoverBody over the real cover
// store in a temp dir, with lib/producers/coverBrief.ts stood in by a stub that keeps the producer's contract (no
// token: a receipt and nothing queued; the token: the job queued and the record's brief set queued). The engine
// itself is WP-A's and has its own test. And the desk's pure reading of the brief (desk/brief/brief.ts): when the
// button is offered, when the desk re-reads, how long since the brief moved.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-cover-brief-acts-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "sound-ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

const fakes = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("../../lib/producers/coverBrief.ts", () => ({
  coverBriefJobId: (id: string) => `job:cover-brief:${id}`,
  launchCoverBrief: async (...a: unknown[]) => {
    fakes.calls.push(a);
    const [, id, o] = a as [unknown, string, { readonly token?: string }];
    if (o.token === undefined) return { ok: true, value: { kind: "receipt", receipt: { token: `brief-${id}` } } };
    const { mutateCover } = await import("../../lib/sound/cover/store.ts");
    const jobId = `job:cover-brief:${id}`;
    await mutateCover(id, (c) => ({ ...c, brief: { state: "queued", jobId, at: "2026-11-08T10:00:00.000Z" } }));
    return { ok: true, value: { kind: "launched", jobId } };
  },
}));

import { rmSync } from "node:fs";

import type { CoverRecord } from "@gt/domain/cover";
import type { Actor } from "@gt/domain/event";
import { openKernel } from "@gt/kernel/kernel";

import { briefCoverBody, briefInput } from "../../app/(studio)/audio/_cover/actsCore.ts";
import { readCoverDesk } from "../../app/(studio)/audio/_cover/read.ts";
import { agreedWords, briefOffered, inFlight, since } from "../../app/(studio)/audio/_cover/desk/brief/brief.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { createCover, mutateCover, readCover } from "../../lib/sound/cover/store.ts";

vi.setConfig({ testTimeout: 30_000 });

const OPERATOR: Actor = { kind: "operator", id: "operator" };

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const store = (() => {
  const k = openKernel(":memory:");
  if (!k.ok) throw k.error;
  return k.value.store;
})();

async function coverIn(change: (c: CoverRecord) => CoverRecord = (c) => c): Promise<CoverRecord> {
  const c = await createCover({ title: "Tears", rights: "third-party-uncleared", source: { bytes: new TextEncoder().encode("stand-in song"), mime: "audio/mpeg", name: "tears.mp3", durationS: 200 } });
  return mutateCover(c.id, change);
}
const input = (id: string, token?: string) => briefInput.parse({ id, ...(token === undefined ? {} : { token }) });

describe("briefCoverBody", () => {
  it("with no token answers the receipt and queues nothing", async () => {
    const c = await coverIn();
    fakes.calls.length = 0;
    const r = await briefCoverBody(input(c.id), store, OPERATOR, true);
    expect(r).toEqual({ ok: true, value: { kind: "receipt", receipt: { token: `brief-${c.id}` } } });
    expect(fakes.calls).toHaveLength(1);
    const [s, id, o] = fakes.calls[0] ?? [];
    expect(s).toBe(store);
    expect(id).toBe(c.id);
    expect(o).toEqual({ actor: OPERATOR, dryOnly: true });
    expect((await readCover(c.id))?.brief).toBeUndefined();
  });

  it("with the receipt's token queues the brief, and the desk's read shows it queued", async () => {
    const c = await coverIn();
    fakes.calls.length = 0;
    const r = await briefCoverBody(input(c.id, `brief-${c.id}`), store, OPERATOR, false);
    expect(r).toEqual({ ok: true, value: { kind: "launched", jobId: `job:cover-brief:${c.id}` } });
    expect(fakes.calls[0]?.[2]).toEqual({ actor: OPERATOR, dryOnly: false, token: `brief-${c.id}` });
    expect((await readCover(c.id))?.brief).toEqual({ state: "queued", jobId: `job:cover-brief:${c.id}`, at: "2026-11-08T10:00:00.000Z" });
    const desk = await readCoverDesk({ cover: c.id });
    expect(desk.current?.record.brief?.state).toBe("queued");
    expect(inFlight(desk.current?.record)).toBe(true);
  });

  it("is offered for a failed cover too", async () => {
    const c = await coverIn((x) => ({ ...x, state: "failed" }));
    fakes.calls.length = 0;
    expect((await briefCoverBody(input(c.id), store, OPERATOR, true)).ok).toBe(true);
    expect(fakes.calls).toHaveLength(1);
  });

  it("is refused for a cover not in draft or failed, before the producer is asked", async () => {
    fakes.calls.length = 0;
    for (const state of ["queued", "rendering", "judging", "picked"] as const) {
      const c = await coverIn((x) => ({ ...x, state, ...(state === "picked" ? { winnerSeed: 1, exportFile: "winner.mp3" } : {}) }));
      const r = await briefCoverBody(input(c.id, "brief-12345678"), store, OPERATOR, true);
      expect(r.ok ? "" : `${r.error.code}: ${r.error.message}`).toBe(`refused: cover ${c.id} is ${state}; a brief is written for a draft or a failed cover`);
      expect((await readCover(c.id))?.brief).toBeUndefined();
    }
    expect(fakes.calls).toHaveLength(0);
  });

  it("answers not-found for a cover the store does not hold", async () => {
    const r = await briefCoverBody(input("cov-0000000000ff"), store, OPERATOR, true);
    expect(r.ok ? "" : r.error.code).toBe("not-found");
  });

  it("holds its input to the door: a malformed id or a short token is refused", () => {
    expect(briefInput.safeParse({ id: "../etc" }).success).toBe(false);
    expect(briefInput.safeParse({ id: "cov-0000000000a1", token: "short" }).success).toBe(false);
    expect(briefInput.safeParse({ id: "cov-0000000000a1", extra: 1 }).success).toBe(false);
  });
});

describe("the desk's reading of the brief", () => {
  const draft = { id: "cov-0000000000a1", state: "draft", takes: [] } as unknown as CoverRecord;
  const at = "2026-11-08T10:00:00.000Z";
  const brief = (state: "queued" | "running" | "done" | "failed") => ({ state, jobId: "job:cover-brief:cov-0000000000a1", at });

  it("offers the button with no brief or a failed one, on a draft or failed cover only", () => {
    expect(briefOffered(draft)).toBe(true);
    expect(briefOffered({ ...draft, brief: brief("failed") })).toBe(true);
    expect(briefOffered({ ...draft, state: "failed" })).toBe(true);
    for (const s of ["queued", "running", "done"] as const) expect(briefOffered({ ...draft, brief: brief(s) })).toBe(false);
    expect(briefOffered({ ...draft, state: "judging" })).toBe(false);
  });

  it("re-reads only while the brief is queued or running, or the cover queued or rendering", () => {
    expect(inFlight(undefined)).toBe(false);
    expect(inFlight(draft)).toBe(false);
    expect(inFlight({ ...draft, brief: brief("queued") })).toBe(true);
    expect(inFlight({ ...draft, brief: brief("running") })).toBe(true);
    expect(inFlight({ ...draft, brief: brief("done") })).toBe(false);
    expect(inFlight({ ...draft, brief: brief("failed") })).toBe(false);
    expect(inFlight({ ...draft, brief: brief("done"), state: "queued" })).toBe(true);
    expect(inFlight({ ...draft, brief: brief("done"), state: "rendering" })).toBe(true);
    expect(inFlight({ ...draft, brief: brief("done"), state: "judging" })).toBe(false);
  });

  it("says how long since the brief moved, and the listens that agreed", () => {
    const t = Date.parse(at);
    expect(since(at, t + 42_000)).toBe("42 s");
    expect(since(at, t + 5 * 60_000 + 10_000)).toBe("5 min");
    expect(since(at, t + 150 * 60_000)).toBe("2 h 30 min");
    expect(since(at, t - 5000)).toBe("0 s");
    expect(since("not a time", t)).toBe("—");
    expect(agreedWords(2)).toBe("2 of 3 listens agreed");
  });
});
