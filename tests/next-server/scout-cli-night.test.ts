import { JPEG, ROOT, disposeRoot, fakeWeb, png, resolve, stubTools } from "./scout-cli-harness.ts";

import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The scene producer is WP2's: its launch is pinned here to the contract's `unavailable`
// answer, so this file tests the CLI's handling of it whatever lands in scoutScene.ts.
vi.mock("../../lib/producers/scoutScene.ts", async () => {
  const { err } = await import("@gt/domain/errors");
  return { launchScene: async () => err("unavailable", "scene 2026: the scout-scene producer is not built yet") };
});

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { createNight, readNight } from "../../lib/foundry/scout/store.ts";
import { getExtractRun } from "../../lib/foundry/extract/store.ts";
import { closeProcessKernel } from "@gt/kernel/process";

// The CLI end to end on a dry night, every store a temp file, every tool a stub,
// the web a fake. GRAVITONE_DRY_ONLY=1 stands for the test lane: nothing arms live.

const ENV = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const WEB = fakeWeb({
  "https://art.example/one.png": { body: png(900, 600), type: "image/png" },
  "https://art.example/two.jpg": { body: JPEG, type: "image/jpeg" },
});

beforeAll(() => {
  vi.stubGlobal("fetch", WEB);
});
afterAll(() => {
  vi.unstubAllGlobals();
  closeProcessKernel();
  disposeRoot();
});

async function cli(argv: string[], ports: CliPorts = {}, env: Record<string, string | undefined> = ENV): Promise<{ code: number; out: string; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env, out: (s) => out.push(s), err: (s) => err.push(s), ports: { resolve, ingest: stubTools().deps, ...ports } });
  let doc: Record<string, unknown> = {};
  try {
    doc = JSON.parse(out.join("\n")) as Record<string, unknown>;
  } catch {
    /* not a --json call */
  }
  return { code, out: out.join("\n"), err: err.join("\n"), doc };
}

function file(name: string, body: unknown): string {
  const p = path.join(ROOT, name);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

const SOURCES = [
  { url: "https://art.example/one.png", kind: "image", title: "One", channel: "Art Example", why: "two flat inks", found: "search" },
  { url: "https://art.example/two.jpg", kind: "image", title: "Two", channel: "Art Example", why: "paper grain", found: "watchlist", watch: "- tag: risograph" },
  { url: "https://www.youtube.com/watch?v=abc123", kind: "video", title: "Trailer", channel: "Studio", why: "a slow push-in", found: "search" },
];

describe("the night, dry, end to end", () => {
  let night = "";

  it("open --live is refused under GRAVITONE_DRY_ONLY=1; open without it makes a dry night and its taste.md", async () => {
    const live = await cli(["open", "--live", "--json"]);
    expect(live.code).toBe(1);
    expect(live.err).toMatch(/GRAVITONE_DRY_ONLY=1/);
    const r = await cli(["open", "--until", "06:30", "--json"]);
    expect(r.code, r.err).toBe(0);
    expect(r.doc["dry"]).toBe(true);
    night = String(r.doc["night"]);
    const n = await readNight(night);
    expect(n.deadline).toBeDefined();
    expect(n.ceilingUsd).toBe(15);
  });

  it("add-source validates, appends three sources, and skips one the batch already holds", async () => {
    const r = await cli(["add-source", night, "--json", file("sources.json", [...SOURCES, SOURCES[0]])]);
    expect(r.code, r.err).toBe(0);
    expect((r.doc["added"] as unknown[]).length).toBe(3);
    expect(r.doc["skipped"]).toEqual([{ url: "https://art.example/one.png", why: "already in this night" }]);
    const bad = await cli(["add-source", night, "--json", file("bad.json", [{ ...SOURCES[0], url: "file:///etc/passwd", found: "search" }])]);
    expect(bad.doc["skipped"]).toEqual([{ url: "file:///etc/passwd", why: "scheme file: is not a download" }]);
  });

  it("ingest launches the scout-ingest job and drives it: pictures fetched, the video cut to keyframes", async () => {
    const r = await cli(["ingest", night, "--json"]);
    expect(r.code, r.err).toBe(0);
    expect(r.doc["outcome"]).toBe("done");
    expect(String(r.doc["jobId"])).toBe(`job:run:scout-ingest:${night}`);
    const n = await readNight(night);
    expect(n.sources.map((s) => s.status)).toEqual(["ingested", "ingested", "ingested"]);
    expect(n.sources[2]?.files).toEqual(["sources/s-03/k-001.jpg", "sources/s-03/k-002.jpg"]);
    expect(n.jobs).toContain(`job:run:scout-ingest:${night}`);
    expect((await cli(["ingest", night, "--json"])).doc["outcome"]).toBe("nothing");
  });

  it("style launches an ordinary extract run over the ingested pictures, dry, and records its run and job", async () => {
    const r = await cli(["style", night, "--sources", "s-01,s-03", "--slug", "riso", "--json"]);
    expect(r.code, r.err).toBe(0);
    const c = r.doc["candidate"] as { id: string; kind: string; status: string; extractRunId: string; jobId: string };
    expect(c).toMatchObject({ kind: "style", status: "rendered" });
    expect(c.jobId).toBe(`job:run:${c.extractRunId}`);
    const { run } = await getExtractRun(c.extractRunId);
    expect(run.dry).toBe(true);
    expect(run.sources.map((s) => s.name)).toEqual(["s-01-p-001.png", "s-03-k-001.jpg", "s-03-k-002.jpg"]);
    expect((await readNight(night)).jobs).toContain(c.jobId);
  });

  it("scene: the producer's `unavailable` is reported verbatim, the candidate fails with it, exit 1", async () => {
    const r = await cli(["scene", night, "--source", "s-03", "--frames", "k-002.jpg", "--json"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("the scout-scene producer is not built yet");
    const c = (await readNight(night)).candidates.find((x) => x.kind === "scene");
    expect(c).toMatchObject({ status: "failed", keyframes: ["sources/s-03/k-002.jpg"], error: "scene 2026: the scout-scene producer is not built yet" });
    expect(c?.kind === "scene" && c.clipRequested).toBeFalsy();
  });

  it("finding and watch write rendered candidates; a template that does not exist is refused", async () => {
    const f = { sourceIds: ["s-03"], template: "trailer", step: "05-cut", claim: "Hold the push-in past the beat", quote: "cuts at 1.0 s and 9.75 s" };
    expect((await cli(["finding", night, "--json", file("f.json", [f])])).code).toBe(0);
    const bad = await cli(["finding", night, "--json", file("g.json", [{ ...f, template: "nope" }])]);
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/no knowledge\/templates\/nope/);
    expect((await cli(["watch", night, "--entry", "site: art.example - https://art.example", "--why", "flat inks", "--sources", "s-01,s-02"])).code).toBe(0);
    expect((await readNight(night)).candidates.map((c) => `${c.kind}:${c.status}`)).toEqual(["style:rendered", "scene:failed", "finding:rendered", "watch:rendered"]);
  });

  it("a launch whose worst case is over what the night has left is refused with the numbers", async () => {
    const tight = await cli(["open", "--ceiling", "0.01", "--json"]);
    const id = String(tight.doc["night"]);
    await cli(["add-source", id, "--json", file("t.json", [{ ...SOURCES[0], url: "https://art.example/one.png?v=2" }])]);
    vi.stubGlobal("fetch", fakeWeb({ "https://art.example/one.png?v=2": { body: png(900, 600), type: "image/png" } }));
    expect((await cli(["ingest", id])).code).toBe(0);
    vi.stubGlobal("fetch", WEB);
    const r = await cli(["style", id, "--sources", "s-01"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/worst case \$0\.\d\d is over the night's remaining \$0\.01 of \$0\.01 Gemini \(settled \$0\.00, held \$0\.00\)/);
    expect((await readNight(id)).candidates).toEqual([]);
  });

  it("a URL an earlier night held but launched nothing from is taken by the next night", async () => {
    // The refused launch above left its night with s-01 ingested and no candidate from it.
    const next = String((await cli(["open", "--json"])).doc["night"]);
    const r = await cli(["add-source", next, "--json", file("held.json", [{ ...SOURCES[0], url: "https://art.example/one.png?v=2" }])]);
    expect(r.code).toBe(0);
    expect(r.doc["skipped"]).toEqual([]);
    expect((r.doc["added"] as { url: string }[]).map((s) => s.url)).toEqual(["https://art.example/one.png?v=2"]);
  });

  it("a URL an earlier night holds is skipped by add-source", async () => {
    const next = String((await cli(["open", "--json"])).doc["night"]);
    const r = await cli(["add-source", next, "--json", file("again.json", [{ ...SOURCES[2], url: "https://youtu.be/abc123" }])]);
    expect(r.code).toBe(0);
    expect(r.doc["added"]).toEqual([]);
    expect(r.doc["skipped"]).toEqual([{ url: "https://youtu.be/abc123", why: `already scouted as ${night}/s-03` }]);
    expect((await cli(["close", next, "--stop", "operator"])).code).toBe(0);
  });

  it("close settles, stops at sources-exhausted under target, and prints the morning; a closed night launches nothing", async () => {
    const r = await cli(["close", night, "--json"]);
    expect(r.code, r.err).toBe(0);
    expect(r.doc).toMatchObject({ packet: `pkt:scout:${night}`, state: "closed", stop: "sources-exhausted", settledUsd: 0, uncappedUsd: 0, heldUsd: 0 });
    expect(r.doc["byKind"]).toMatchObject({ style: { rendered: 1 }, scene: { failed: 1 }, finding: { rendered: 1 }, watch: { rendered: 1 } });
    const again = await cli(["style", night, "--sources", "s-01"]);
    expect(again.code).toBe(1);
    expect(again.err).toMatch(/is closed \(sources-exhausted\); nothing more is launched/);
  });

  it("a launch after the deadline closes the night with stop deadline", async () => {
    const n = await createNight({ dry: true, deadline: new Date(Date.now() - 60_000).toISOString() });
    const r = await cli(["ingest", n.id]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/passed its deadline/);
    expect((await readNight(n.id)).stop).toBe("deadline");
  });

  it("status reads one night with its budget, and the list", async () => {
    const one = await cli(["status", night, "--json"]);
    expect(one.code).toBe(0);
    expect(one.doc["budget"]).toEqual({ ceilingUsd: 15, settledUsd: 0, uncappedUsd: 0, heldUsd: 0, remainingUsd: 15, clipsUsed: 0, clipCap: 2 });
    const all = await cli(["status", "--json"]);
    expect((all.doc["nights"] as { id: string }[]).map((x) => x.id)).toContain(night);
  });
});

describe("the other doors", () => {
  it("doctor prints a line per check and exits 1 when a binary a night needs is missing", async () => {
    const good = await cli(["doctor", "--dry", "--json"], { spawn: stubTools().spawn });
    expect(good.code, good.out).toBe(0);
    const secret = "AIza-not-a-real-key-0123456789";
    const bad = await cli(["doctor", "--dry"], { spawn: async (bin) => (bin === "ffmpeg" ? { ok: false, error: "spawn ffmpeg ENOENT" } : stubTools().spawn(bin, ["-version"])) }, { ...ENV, GOOGLE_AI_API_KEY: secret });
    expect(bad.code).toBe(1);
    expect(bad.out).toMatch(/^ok   yt-dlp +yt-dlp version 9\.9$/m);
    expect(bad.out).toMatch(/^FAIL ffmpeg +ffmpeg: spawn ffmpeg ENOENT -> install ffmpeg/m);
    expect(bad.out).toMatch(/^ok   GOOGLE_AI_API_KEY +set$/m);
    expect(bad.out).not.toContain(secret);
    // A live night's doctor reads the dry pin and a missing key as failures, not notes.
    const live = await cli(["doctor"], { spawn: stubTools().spawn });
    expect(live.code).toBe(1);
    expect(live.out).toMatch(/^FAIL GRAVITONE_DRY_ONLY/m);
  });

  it("folder hands its arguments to the extract CLI and exits with its code", async () => {
    const seen: string[][] = [];
    const r = await cli(["folder", "C:/gallery", "--slug", "x", "--dry"], { run: async (_cmd, args) => (seen.push([...args]), 3) });
    expect(r.code).toBe(3);
    expect(seen[0]?.slice(process.execArgv.length)).toEqual([path.join(path.resolve(import.meta.dirname, "..", ".."), "pipeline", "foundry", "extract.mts"), "C:/gallery", "--slug", "x", "--dry"]);
  });

  it("usage is exit 2", async () => {
    expect((await cli([])).code).toBe(2);
    expect((await cli(["style", "2026-10-01"])).code).toBe(2);
    expect((await cli(["nope"])).code).toBe(2);
  });
});
