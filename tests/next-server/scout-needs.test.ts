// A GAME'S ASSET NEEDS (spark scout-vision S4) - lib/foundry/scout/needs.ts against the fixture
// pipeline/fixtures/asset-needs-bp.json (the `asset-needs/1` contract POF's exporter writes), copied
// into a temp POF root per test: the reader (fresh, stale, missing, malformed, wrong project), the
// door's rule (a project brief names an open briefable need and takes its budget; mage-arena is
// retired; a newProject brief is untouched), the taste brief's `## Asset needs`, and the Board row.
// No real ../pof is read: every root is EXPORT_ROOT_POF or an explicit temp dir.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assetUse } from "../../lib/decision/v1/sources/scoutPlan.ts";
import { parseBrief, type BriefInput } from "../../lib/foundry/scout/concept.ts";
import { needsPath, needsRoot, needsSection, NEEDS_STALE_DAYS, openNeeds, readNeeds, withNeed, type NeedsRead } from "../../lib/foundry/scout/needs.ts";

const FIXTURE = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "..", "pipeline", "fixtures", "asset-needs-bp.json"), "utf8")) as Record<string, unknown>;
const NOW = new Date("2026-10-26T08:00:00.000Z");
const RETIRED = "mage-arena is developed on another device; gravitone no longer briefs for it (spark scout-vision S4)";

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "gt-needs-"));
  mkdirSync(path.join(root, "asset-needs"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const put = (project: string, body: unknown): void => writeFileSync(path.join(root, "asset-needs", `${project}.json`), typeof body === "string" ? body : JSON.stringify(body));
const read = (project = "bp"): Promise<NeedsRead> => readNeeds(project, { root, now: NOW });
const brief = (raw: Record<string, unknown>): BriefInput => {
  const r = parseBrief({ use: "a pin on the light table", ...raw });
  if (!r.ok) throw r.error;
  return r.value;
};
const why = (r: { ok: boolean; error?: Error }): string => (r.ok ? "ok" : (r.error?.message ?? ""));

describe("the reader", () => {
  it("a fresh file reads with its age; the root is EXPORT_ROOT_POF else ../pof", async () => {
    put("bp", FIXTURE);
    const r = await read();
    expect(r).toMatchObject({ ok: true, project: "bp", path: path.join(root, "asset-needs", "bp.json") });
    if (!r.ok) return;
    expect(r.ageDays).toBeCloseTo(9 / 24, 5);
    expect(r.file.needs.map((n) => n.id)).toEqual(["need-amber-pins-with-tags", "need-lamp-agent", "need-scan-line"]);
    expect(openNeeds(r.file).map((n) => n.id)).toEqual(["need-amber-pins-with-tags", "need-lamp-agent"]);
    expect(r.file.rules).not.toHaveProperty("budgets");
    expect(needsRoot({ EXPORT_ROOT_POF: "D:/pof" })).toBe("D:/pof");
    expect(needsRoot({})).toBe(path.resolve(process.cwd(), "..", "pof"));
    expect(needsPath("bp", "D:/pof")).toBe(path.join("D:/pof", "asset-needs", "bp.json"));
  });

  it(`stale past ${NEEDS_STALE_DAYS} days: unreadable, with its age and the command that refreshes it`, async () => {
    put("bp", { ...FIXTURE, generatedAt: "2026-10-17T08:00:00.000Z" });
    expect(await read()).toMatchObject({ ok: false, why: "bp's asset needs are 9 days old (generated 2026-10-17, stale past 7); run `npx tsx scripts/asset-needs.ts bp` in pof" });
    put("bp", { ...FIXTURE, generatedAt: "2026-10-19T08:00:00.000Z" });
    expect((await read()).ok).toBe(true);
  });

  it("missing, malformed, off-contract or another project's: unreadable, each with its reason", async () => {
    expect(await read()).toMatchObject({ ok: false, why: `bp has no asset-needs file at ${path.join(root, "asset-needs", "bp.json")}; run \`npx tsx scripts/asset-needs.ts bp\` in pof` });
    put("bp", "{ not json");
    expect(await read()).toMatchObject({ ok: false, why: expect.stringMatching(/^asset-needs bp: not valid JSON: /) });
    put("bp", { ...FIXTURE, schema: "asset-needs/2" });
    expect(await read()).toMatchObject({ ok: false, why: expect.stringMatching(/^asset-needs bp: schema: /) });
    const needs = FIXTURE["needs"] as Record<string, unknown>[];
    put("bp", { ...FIXTURE, needs: [{ ...needs[0], priority: 4 }] });
    expect(await read()).toMatchObject({ ok: false, why: expect.stringMatching(/^asset-needs bp: needs\.0\.priority: /) });
    put("bp", { ...FIXTURE, needs: [{ ...needs[0], id: "pins" }] });
    expect(await read()).toMatchObject({ ok: false, why: "asset-needs bp: needs.0.id: a need id is need-<slug>" });
    put("pof", FIXTURE);
    expect(await read("pof")).toMatchObject({ ok: false, why: `${path.join(root, "asset-needs", "pof.json")} is the asset needs of bp, not pof` });
  });
});

describe("the door's rule", () => {
  const PIN = { class: "prop", subject: "amber survey pin with a paper tag", serves: { project: "bp" }, need: "need-amber-pins-with-tags" };

  it("a bp brief naming an open need takes the need's budget; a need with none takes the class budget", async () => {
    put("bp", FIXTURE);
    const r = withNeed(brief(PIN), await read());
    expect(r.ok && r.value).toMatchObject({ need: "need-amber-pins-with-tags", serves: { project: "bp" }, brief: { class: "prop", budgetTris: 500 } });
    const lamp = withNeed(brief({ class: "character", subject: "the lamp agent, head on a two-joint arm", serves: { project: "bp" }, need: "need-lamp-agent" }), await read());
    expect(lamp.ok && lamp.value.brief).toMatchObject({ class: "character", budgetTris: 40_000, rig: "ue5-mannequin" });
  });

  it("a bp brief without a need, with an unknown or non-briefable one, or of another class is refused", async () => {
    put("bp", FIXTURE);
    const r = await read();
    const { need: _n, ...noNeed } = PIN;
    expect(why(withNeed(brief(noNeed), r))).toBe('asset brief: serves bp names a need: need: "<id>", one of need-amber-pins-with-tags, need-lamp-agent');
    expect(why(withNeed(brief({ ...PIN, need: "need-castle-gate" }), r))).toBe(`asset brief: need need-castle-gate is not in ${path.join(root, "asset-needs", "bp.json")}`);
    expect(why(withNeed(brief({ ...PIN, need: "need-scan-line" }), r))).toBe("asset brief: need need-scan-line (shader) is not a mesh gravitone briefs");
    expect(why(withNeed(brief({ ...PIN, class: "weapon", kind: "staff" }), r))).toBe("asset brief: need need-amber-pins-with-tags is a prop, not a weapon");
    expect(why(parseBrief({ ...PIN, use: "x", need: "pins" }))).toBe("asset brief: need: need-<slug>, an id from the project's asset needs");
  });

  it("a stale or missing file refuses every project brief with the reader's why; pof has no game to measure", async () => {
    expect(why(withNeed(brief(PIN), await read()))).toBe(`asset brief: serves bp: bp has no asset-needs file at ${path.join(root, "asset-needs", "bp.json")}; run \`npx tsx scripts/asset-needs.ts bp\` in pof`);
    put("bp", { ...FIXTURE, generatedAt: "2026-10-01T08:00:00.000Z" });
    expect(why(withNeed(brief(PIN), await read()))).toMatch(/^asset brief: serves bp: bp's asset needs are 25 days old/);
    expect(why(withNeed(brief({ ...PIN, serves: { project: "pof" } }), await read("pof")))).toMatch(/^asset brief: serves pof: pof has no game content to measure - pof has no asset-needs file at /);
  });

  it("mage-arena is refused at the door in its own sentence; a newProject brief is untouched and names no need", async () => {
    expect(why(parseBrief({ ...PIN, use: "x", serves: { project: "mage-arena" } }))).toBe(`asset brief: serves: ${RETIRED}`);
    expect(why(parseBrief({ ...PIN, use: "x", serves: { project: "skyrim" } }))).toMatch(/^asset brief: serves: serves: \{project: pof \| bp\}/);
    const fresh = brief({ class: "prop", subject: "a hay bale", serves: { newProject: "a cozy farming sim" } });
    const unread: NeedsRead = { ok: false, project: "bp", why: "unread", path: "x" };
    expect(withNeed(fresh, unread)).toEqual({ ok: true, value: fresh });
    expect(fresh.brief.budgetTris).toBe(10_000);
    expect(fresh).not.toHaveProperty("need");
    expect(why(parseBrief({ class: "prop", subject: "a hay bale", use: "x", serves: { newProject: "a cozy farming sim" }, need: "need-amber-pins-with-tags" }))).toBe("asset brief: need: a need is a project's; a newProject brief names none");
  });
});

describe("the taste brief and the Board row", () => {
  it("## Asset needs lists the open briefable needs and the rest's count, or why a project could not be read", async () => {
    put("bp", FIXTURE);
    expect(needsSection([await read(), await read("pof")])).toEqual([
      "## Asset needs",
      "",
      "- bp · generated 2026-10-25 · 2 open to brief · 1 not briefable",
      "  - need-amber-pins-with-tags · scored-low · Amber pins with paper tags · prop 500 tris · Not built (L5)",
      "  - need-lamp-agent · scored-low · The lamp agent: head, two-joint arm, base · character 40000 tris · Reads as a desk lamp",
      "",
      `- pof: unreadable - pof has no asset-needs file at ${path.join(root, "asset-needs", "pof.json")}; run \`npx tsx scripts/asset-needs.ts pof\` in pof`,
      "",
    ]);
    expect(needsSection([])).toEqual([]);
  });

  it("the 3D row names the project, the need, then the use; an old mage-arena candidate still reads", () => {
    expect(assetUse({ use: "a pin on the light table", serves: { project: "bp" }, need: "need-amber-pins-with-tags" })).toBe("for bp · need need-amber-pins-with-tags · a pin on the light table");
    expect(assetUse({ use: "the forge set dressing", serves: { project: "mage-arena" } })).toBe("for mage-arena · the forge set dressing");
  });
});
