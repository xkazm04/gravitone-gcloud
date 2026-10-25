// A NIGHT'S PROPOSALS ON THE BOARD (spark scout-vision S2 WP2) - lib/decision/v1/sources/scout.ts over `genre` and
// `venture` candidates: ONE words cell each (`c-01/words`, text/plain) under the `genres` group, the name its label,
// the look and grammar (a venture's frame) and the kept cells it stands on its words. The preview names each birth;
// the apply births a kept genre or venture in the kernel exactly once - a second delivery and a redelivery after a
// crash before the record both find it born - and a rejected proposal, or any proposal of a dry night, births nothing.
// The kernel is the harness's own in-memory one; every v1 store is a temp directory set below.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-genres-"));
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

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ok } from "@gt/domain/errors";
import { SOURCES } from "@gt/domain/source";
import type { Store } from "@gt/kernel/store";
import { listGenres, listVentures } from "@gt/kernel/ventures/store";

import { closeKernel } from "../../lib/kernelStore.ts";
import { makeScoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import type { Candidate, GenreProposalCandidate, Night, VentureProposalCandidate } from "../../lib/foundry/scout/types.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const NIGHT = "2026-10-21";
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const genre = (id: string, over: Partial<GenreProposalCandidate> = {}): GenreProposalCandidate => ({
  id,
  kind: "genre",
  sourceIds: [],
  status: "rendered",
  name: "Quiet one-light mysteries",
  fromStoryboard: "2026-10-20/c-04",
  look: "amber against slate",
  grammar: ["the light moves", "the chase", "the reveal"],
  basedOn: ["2026-10-20/c-04/words"],
  use: "short: a slow-reveal Short",
  ...over,
});

const venture = (id: string): VentureProposalCandidate => ({
  id,
  kind: "venture",
  sourceIds: [],
  status: "rendered",
  name: "Coat Rack Records",
  ventureKind: "album",
  frame: { tone: "wistful", audience: "adults", format: "a 10-track album", look: "bandoneon and upright bass", genres: [] },
  basedOn: ["2026-10-20/c-05/a1", "2026-10-20/c-05/a2", "2026-10-20/c-06/a1", "2026-10-20/c-06/a2"],
  aim: "four kept tangos share one sound",
});

function candidates(): Candidate[] {
  return [genre("c-01", { aim: "two kept boards share one light" }), venture("c-02"), genre("c-03", { name: "Neon title cards", fromStoryboard: "2026-10-20/c-07", basedOn: ["2026-10-20/c-07/words"] })];
}

const nightFile = (): string => path.join(out, "scout", NIGHT, "night.json");
function seed(o: { dry?: boolean } = {}): Night {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  mkdirSync(path.join(out, "scout", NIGHT), { recursive: true });
  const night: Night = { id: NIGHT, startedAt: `${NIGHT}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: o.dry === true, state: "closed", stop: "target", sources: [], candidates: candidates(), jobs: [] };
  writeFileSync(nightFile(), JSON.stringify(night));
  return night;
}

/** An adapter over the flow's own kernel, bound once the flow is open. */
function adapterOver(): { readonly adapter: ReturnType<typeof makeScoutAdapter>; bind(s: Store): void } {
  let bound: Store | undefined;
  return {
    adapter: makeScoutAdapter({ store: () => (bound === undefined ? ok(undefined as unknown as Store) : ok(bound)) }),
    bind: (s) => {
      bound = s;
    },
  };
}

const heads = (s: Store) => must(s.read((r) => ({ genres: listGenres(r), ventures: listVentures(r) })));

describe("scout adapter - a proposal is a words cell under genres", () => {
  it("draws each proposal as one text cell: its name, its look and grammar or frame, what it stands on", async () => {
    seed();
    const { adapter } = adapterOver();
    const flow = await openFlow(adapter, NIGHT, blobDir);
    const { packet, present, losses } = flow.plan;
    expect(packet.items.map((c) => [c.id, c.row, c.media.mime])).toEqual([
      ["c-01/words", "c-01", "text/plain"],
      ["c-03/words", "c-03", "text/plain"],
      ["c-02/words", "c-02", "text/plain"],
    ]);
    expect(losses).toEqual([]);
    expect(present.items["c-01/words"]).toEqual({ label: "Quiet one-light mysteries", meta: "genre · from storyboard 2026-10-20/c-04 · based on 1 kept", prompt: "look: amber against slate\n- the light moves\n- the chase\n- the reveal\nbased on: 2026-10-20/c-04/words" });
    expect(present.items["c-02/words"]).toEqual({ label: "Coat Rack Records", meta: "album venture · based on 4 kept", prompt: `a 10-track album · wistful for adults · look: bandoneon and upright bass\nbased on: ${venture("c-02").basedOn.join(", ")}` });
    expect(present.rows.find((r) => r.id === "c-01")).toEqual({ id: "c-01", label: "genre · Quiet one-light mysteries", group: "genres", use: "short: a slow-reveal Short", aim: "two kept boards share one light" });
    expect(present.rows.find((r) => r.id === "c-02")).toEqual({ id: "c-02", label: "album · Coat Rack Records", group: "genres", aim: "four kept tangos share one sound" });
    // The genres group's keys 2-4.
    expect(SOURCES.scout.reasonsBy?.["genres"]).toEqual(["generic", "use case", "story"]);
  });

  it("previews each birth, births exactly once across a second delivery and a redelivery, and a rejected proposal births nothing", async () => {
    const before = seed();
    const { adapter, bind } = adapterOver();
    const flow = await openFlow(adapter, NIGHT, blobDir);
    bind(flow.store);
    flow.patch([
      { candidate: "c-01/words", verdict: "keep" },
      { candidate: "c-02/words", verdict: "keep" },
      { candidate: "c-03/words", verdict: "reject", reasons: ["generic"] },
    ]);
    const p = must(flow.preview()).consequence;
    expect(p.promotions).toEqual([
      { target: "genres", candidate: "c-01/words", detail: "genre Quiet one-light mysteries born" },
      { target: "ventures", candidate: "c-02/words", detail: "venture Coat Rack Records born" },
    ]);
    expect(p.writes).toContainEqual({ kind: "file", target: `foundry-out/scout/${NIGHT}/night.json`, candidate: "c-03/words", detail: "refused: nothing is born, and the reasons ban it" });
    must(flow.commit());
    const claim = flow.claim();
    must(await adapter.apply(claim));
    const once = heads(flow.store);
    expect(once.genres.map((g) => [g.name, g.proposal, g.bornFrom, g.use, g.look, g.grammar])).toEqual([["Quiet one-light mysteries", `${NIGHT}/c-01`, "2026-10-20/c-04", "short: a slow-reveal Short", "amber against slate", ["the light moves", "the chase", "the reveal"]]]);
    // The operator's keep: born by the Board's operator actor.
    expect(once.genres[0]?.by).toBe("board");
    expect(once.ventures.map((v) => [v.name, v.kind, v.proposal, v.frame])).toEqual([["Coat Rack Records", "album", `${NIGHT}/c-02`, venture("c-02").frame]]);
    // A second delivery of the same claim.
    must(await adapter.apply(claim));
    // A redelivery after a crash between the births and the record: the night as it was, the kernel already born.
    writeFileSync(nightFile(), JSON.stringify(before));
    must(await adapter.apply(claim));
    expect(heads(flow.store)).toEqual(once);
    expect((JSON.parse(readFileSync(nightFile(), "utf8")) as Night).committed).toMatchObject({ kept: ["c-01/words", "c-02/words"], rejected: ["c-03/words"] });
  });

  it("a dry night previews the verdicts only and births nothing", async () => {
    seed({ dry: true });
    const { adapter, bind } = adapterOver();
    const flow = await openFlow(adapter, NIGHT, blobDir);
    bind(flow.store);
    flow.patch([
      { candidate: "c-01/words", verdict: "keep" },
      { candidate: "c-02/words", verdict: "keep" },
      { candidate: "c-03/words", verdict: "keep" },
    ]);
    const p = must(flow.preview()).consequence;
    expect(p.promotions).toEqual([]);
    expect(p.writes).toEqual([{ kind: "file", target: `foundry-out/scout/${NIGHT}/night.json`, detail: "committed · dry: the verdicts only; no style, scene or knowledge is admitted" }]);
    must(flow.commit());
    must(await adapter.apply(flow.claim()));
    expect(heads(flow.store)).toEqual({ genres: [], ventures: [] });
  });
});
