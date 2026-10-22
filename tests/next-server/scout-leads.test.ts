// THE LEAD QUEUE ON THE BOARD'S COMMIT (spark registry-feedback-loop WP-R1): a scout night's
// commit queues what its keeps EARNED for the ai-registry - a finding said again after an
// earlier night kept it, a keep from a source marked `rich`, a style the commit proves -
// exactly once each, names every one in the preview first, and queues nothing on a
// redelivery or a dry night. A restated finding's PATTERNS line reads n=2 and cites the
// earlier marker. Every store is a temp directory: nothing here reads the checkout's.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-leads-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "style-store", "gravitone.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "foundry-out", "extract");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeKernel } from "../../lib/kernelStore.ts";
import { leadEventsOf } from "../../lib/foundry/scout/leadEvents.ts";
import { readQueue } from "../../lib/foundry/scout/leads.ts";
import type { Candidate, Night, NightCommit } from "../../lib/foundry/scout/types.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const EARLIER = "2026-10-20";
const NIGHT = "2026-10-21";
const DRY = "2026-10-22";
const RICH = "https://example.com/talk/lighting";
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");
const PATTERNS = path.join(ROOT, "knowledge", "templates", "cinematic", "steps", "02-frames", "PATTERNS.md");
const LEADS = path.join(out, "scout", "leads.json");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const finding = (id: string, source: string, claim: string, quote: string, restates?: string): Candidate => ({ id, kind: "finding", sourceIds: [source], status: "rendered", template: "cinematic", step: "02-frames", claim, quote, ...(restates === undefined ? {} : { restates }) });

function night(id: string, o: { dry?: boolean; candidates: Candidate[]; sources: Night["sources"]; committed?: NightCommit }): Night {
  return { id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: o.dry ?? false, state: o.committed === undefined ? "closed" : "committed", stop: "target", closedAt: `${id}T05:00:00.000Z`, sources: o.sources, candidates: o.candidates, jobs: [], ...(o.committed === undefined ? {} : { committed: o.committed }) };
}
const src = (id: string, url: string, rich?: string): Night["sources"][number] => ({ id, url, kind: "page", title: `page ${id}`, why: "craft", found: "search", rights: "reference-only", status: "ingested", files: [], ...(rich === undefined ? {} : { rich }) });

function seed(): void {
  closeKernel();
  for (const d of ["style-store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  mkdirSync(path.join(ROOT, "knowledge", "templates", "cinematic"), { recursive: true });
  const write = (n: Night): void => {
    mkdirSync(path.join(out, "scout", n.id), { recursive: true });
    writeFileSync(path.join(out, "scout", n.id, "night.json"), JSON.stringify(n));
  };
  // The earlier night kept c-01 and rejected c-02, live.
  write(
    night(EARLIER, {
      sources: [src("s-01", "https://example.com/first")],
      candidates: [finding("c-01", "s-01", "Motivate the key from a practical in frame", "the lamp is the key"), finding("c-02", "s-01", "Backlight every exterior", "rim it")],
      committed: { at: `${EARLIER}T09:00:00.000Z`, by: "operator", kept: ["c-01/text"], rejected: ["c-02/text"], reasons: {}, notes: {}, dry: false },
    }),
  );
  const tonight = (id: string, dry: boolean): Night =>
    night(id, {
      dry,
      sources: [src("s-01", id === NIGHT ? RICH : `${RICH}/${id}`, "a whole lighting method, key to fill to rim"), src("s-02", `https://example.com/second/${id}`)],
      candidates: [
        finding("c-01", "s-02", "Let a practical lamp in frame motivate the key", "every key I set has a reason in the shot", `${EARLIER}/c-01`),
        finding("c-02", "s-01", "Set the fill by the ratio, not by eye", "two stops under, always"),
        { id: "c-03", kind: "watch", sourceIds: ["s-02"], status: "rendered", entry: "channel: gaffer notes", why: "lighting" },
        // Restates what the earlier night REJECTED: not a second observation.
        finding("c-04", "s-02", "Backlight the exteriors at dusk", "rim it, always", `${EARLIER}/c-02`),
      ],
    });
  write(tonight(NIGHT, false));
  write(tonight(DRY, true));
}

const VERDICTS = [
  { candidate: "c-01/text", verdict: "keep" as const },
  { candidate: "c-02/text", verdict: "keep" as const },
  { candidate: "c-03/text", verdict: "reject" as const, reasons: ["generic"] },
  { candidate: "c-04/text", verdict: "keep" as const },
];

describe("the commit queues what the keeps earned", () => {
  it("previews each lead, then queues exactly one event each; a redelivery queues nothing", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch(VERDICTS);
    const p = must(flow.preview()).consequence;
    const leads = p.writes.filter((w) => w.target === "foundry-out/scout/leads.json");
    expect(leads).toEqual([
      { kind: "file", target: "foundry-out/scout/leads.json", candidate: "c-01/text", detail: `queues a registry lead: finding-restated ${NIGHT}/c-01` },
      { kind: "file", target: "foundry-out/scout/leads.json", candidate: "c-02/text", detail: `queues a registry lead: source-rich ${RICH}` },
    ]);
    // The night's record stays the last write.
    expect(p.writes.at(-1)).toMatchObject({ target: `foundry-out/scout/${NIGHT}/night.json` });

    must(flow.commit());
    const claim = flow.claim();
    must(await scoutAdapter.apply(claim));
    const q = await readQueue();
    expect(q.events.map((e) => e.key)).toEqual([`finding-restated:${NIGHT}/c-01`, `source-rich:${RICH}`]);
    const restated = q.events[0];
    expect(restated).toMatchObject({ kind: "finding-restated", night: NIGHT, refs: [`${NIGHT}/c-01`, `${EARLIER}/c-01`] });
    expect(restated?.evidence).toEqual([
      `claim (${EARLIER}/c-01): Motivate the key from a practical in frame`,
      `quote (${EARLIER}/c-01): "the lamp is the key"`,
      `source (${EARLIER}/c-01): https://example.com/first`,
      `claim (${NIGHT}/c-01): Let a practical lamp in frame motivate the key`,
      `quote (${NIGHT}/c-01): "every key I set has a reason in the shot"`,
      `source (${NIGHT}/c-01): https://example.com/second/${NIGHT}`,
    ]);
    expect(q.events[1]?.evidence).toEqual(["rich: a whole lighting method, key to fill to rim", `source: ${RICH} (page s-01)`, "kept: c-02/text"]);

    // A restated finding's line is n=2 and cites the earlier marker; one restating a rejection stays n=1.
    const lines = readFileSync(PATTERNS, "utf8").split("\n");
    expect(lines.find((l) => l.includes(`scout:${NIGHT}/c-01 -->`))).toBe(`- Let a practical lamp in frame motivate the key - "every key I set has a reason in the shot" (n=2, scout ${NIGHT}, restates scout:${EARLIER}/c-01, https://example.com/second/${NIGHT}) <!-- scout:${NIGHT}/c-01 -->`);
    expect(lines.find((l) => l.includes(`scout:${NIGHT}/c-04 -->`))).toContain(`(n=1, scout ${NIGHT}, https://example.com/second/${NIGHT})`);

    const before = readFileSync(LEADS, "utf8");
    must(await scoutAdapter.apply(claim));
    expect(readFileSync(LEADS, "utf8")).toBe(before);
  });

  it("a key the queue holds already is previewed as `already queued`", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch(VERDICTS);
    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    // The same keeps read again over the queue they filled (the night's record put back to closed).
    const again = must(await scoutAdapter.read({ runId: NIGHT }));
    const { committed: _c, ...open } = again.night;
    const p = must(flow.preview({ ...again, night: { ...open, state: "closed" } })).consequence;
    expect(p.writes.filter((w) => w.target === "foundry-out/scout/leads.json").map((w) => w.detail)).toEqual([`already queued: finding-restated ${NIGHT}/c-01`, `already queued: source-rich ${RICH}`]);
  });

  it("a dry night queues nothing and writes no PATTERNS line", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, DRY, blobDir);
    flow.patch(VERDICTS);
    const p = must(flow.preview()).consequence;
    expect(p.writes.map((w) => w.target)).toEqual([`foundry-out/scout/${DRY}/night.json`]);
    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    expect(existsSync(LEADS)).toBe(false);
    expect(existsSync(PATTERNS)).toBe(false);
  });
});

describe("leadEventsOf (pure)", () => {
  const n = night(NIGHT, { sources: [src("s-01", RICH, "a method")], candidates: [{ id: "c-01", kind: "style", sourceIds: ["s-01"], status: "rendered", extractRunId: "r1" }] });

  it("a style the commit proves queues one style-proven event, with its kept cells and the recipe's first clause", () => {
    const got = leadEventsOf({ night: n, kept: [], earlier: new Map(), proven: [{ id: "inkwash", recipe: "flat ink washes; paper grain", cells: ["c-01/inkwash/replica-1"] }, { id: "inkwash", cells: [] }] });
    expect(got).toEqual([{ key: "style-proven:inkwash", kind: "style-proven", night: NIGHT, refs: ["inkwash"], evidence: ["kept: c-01/inkwash/replica-1", "recipe: flat ink washes"] }]);
  });

  it("a rich source behind no kept cell earns nothing; behind a kept style look it earns one event", () => {
    expect(leadEventsOf({ night: n, kept: [], earlier: new Map() })).toEqual([]);
    const got = leadEventsOf({ night: n, kept: ["c-01/inkwash/replica-1", "c-01/inkwash/transfer-1"], earlier: new Map() });
    expect(got.map((e) => [e.key, e.evidence.filter((l) => l.startsWith("kept: "))])).toEqual([[`source-rich:${RICH}`, ["kept: c-01/inkwash/replica-1", "kept: c-01/inkwash/transfer-1"]]]);
  });
});
