// A NIGHT'S DIRECTIONS ON THE BOARD (spark scout-idea-artboards WP-I4a) - lib/decision/v1/sources/
// scout.ts over `direction` candidates: ONE words cell per direction (`c-01/text`, text/plain, filed
// under `notes`), its title the label, the brief's own words under it, how many kept cells it stands
// on the meta. The preview names what each verdict does - kept, a confirmed direction the next nights
// work inside; rejected, a refused one - and the commit writes nothing but the night's record. An
// idea with a genre names it in its meta. Every store is a temp directory set below.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-direction-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "foundry-out", "extract");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["MESH_STORE_DIR"] = path.join(dir, "foundry-out", "mesh");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeKernel } from "../../lib/kernelStore.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import type { Candidate, DirectionCandidate, Night } from "../../lib/foundry/scout/types.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const NIGHT = "2026-10-21";
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const direction = (id: string, over: Partial<DirectionCandidate> = {}): DirectionCandidate => ({
  id,
  kind: "direction",
  sourceIds: [],
  status: "rendered",
  title: "Animated comedy sketch, dark humour for adults",
  format: "short",
  genre: "animated comedy sketch",
  style: "cut-paper harbour look",
  tone: "deadpan, dark humour",
  audience: "adults",
  premise: "A lighthouse keeper keeps switching the lamp off to save money; the ships keep finding him anyway.",
  basedOn: ["2026-10-20/c-03/board", "2026-10-20/c-05/text"],
  ...over,
});

function candidates(): Candidate[] {
  return [
    direction("c-01", { use: "a 30-second YouTube Short" }),
    { id: "c-02", kind: "idea", sourceIds: [], status: "rendered", title: "Neon title card in the rain", target: "scene", genre: "title opener", prompt: "rough frame, a title card under a neon sign", anchor: { kind: "watch", ref: "tag: neon noir" }, image: "ideas/c-02.png" },
    direction("c-03", { title: "Gallery prints of the harbour", format: "video", genre: "art print", basedOn: ["2026-10-20/c-03/board"] }),
  ];
}

function seed(): void {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  const dir = path.join(out, "scout", NIGHT);
  mkdirSync(path.join(dir, "ideas"), { recursive: true });
  writeFileSync(path.join(dir, "ideas", "c-02.png"), "png c-02");
  const night: Night = { id: NIGHT, startedAt: `${NIGHT}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "closed", stop: "target", sources: [], candidates: candidates(), jobs: [] };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

const nightOf = (): Night => JSON.parse(readFileSync(path.join(out, "scout", NIGHT, "night.json"), "utf8")) as Night;
function files(dir = ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) return ["store", "blobs"].includes(e.name) && dir === ROOT ? [] : files(abs);
    return e.name === "night.json" ? [] : [`${path.relative(ROOT, abs)} ${readFileSync(abs, "utf8").length}`];
  });
}

describe("scout adapter - a direction is a words cell in notes", () => {
  it("draws each direction as one text cell: its title, the brief's words, what it stands on", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    const { packet, present, urls, losses } = flow.plan;
    expect(packet.items.map((c) => [c.id, c.row, c.media.mime, c.jobId])).toEqual([
      ["c-02/board", "c-02", "image/png", `scout:${NIGHT}`],
      ["c-01/text", "c-01", "text/plain", `scout:${NIGHT}`],
      ["c-03/text", "c-03", "text/plain", `scout:${NIGHT}`],
    ]);
    expect(losses).toEqual([]);
    expect(urls["c-01/text"]).toBe(`/api/foundry/file?run=${NIGHT}&path=night.json&kind=scout`);
    expect(present.items["c-01/text"]).toEqual({
      label: "Animated comedy sketch, dark humour for adults",
      meta: "based on 2 kept",
      prompt: "short · animated comedy sketch · cut-paper harbour look · deadpan, dark humour for adults · A lighthouse keeper keeps switching the lamp off to save money; the ships keep finding him anyway.",
    });
    expect(present.items["c-03/text"]?.meta).toBe("based on 1 kept");
    expect(present.rows.find((r) => r.id === "c-01")).toEqual({ id: "c-01", label: "direction · animated comedy sketch", group: "notes", use: "a 30-second YouTube Short" });
    expect(present.rows.find((r) => r.id === "c-03")).toEqual({ id: "c-03", label: "direction · art print", group: "notes" });
    // An idea's genre rides after its target.
    expect(present.items["c-02/board"]?.meta).toBe("scene · title opener · watch: tag: neon noir");
  });

  it("previews kept as a confirmed direction and rejected as a refused one, then commits only the night's record", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch([
      { candidate: "c-01/text", verdict: "keep" },
      { candidate: "c-02/board", verdict: "keep" },
      { candidate: "c-03/text", verdict: "reject", reasons: ["use case"], note: "we never print" },
    ]);
    const p = must(flow.preview()).consequence;
    const record = `foundry-out/scout/${NIGHT}/night.json`;
    expect(p.writes).toEqual([
      { kind: "file", target: record, candidate: "c-01/text", detail: "a confirmed direction: the next nights work inside it" },
      { kind: "file", target: record, candidate: "c-02/board", detail: "develops next night as a scene" },
      { kind: "file", target: record, candidate: "c-03/text", detail: "a refused direction" },
      { kind: "file", target: record, detail: "committed: every verdict, its reasons and its note" },
    ]);
    const before = files();
    must(flow.commit());
    must(await scoutAdapter.apply(flow.claim()));
    expect(nightOf()).toMatchObject({ state: "committed", committed: { kept: ["c-02/board", "c-01/text"], rejected: ["c-03/text"], reasons: { "c-03/text": ["use case"] }, notes: { "c-03/text": "we never print" } } });
    // No knowledge line, no watchlist: a direction's keep is the record alone.
    expect(files()).toEqual(before);
  });
});
