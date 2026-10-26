import { ROOT, disposeRoot, resolve } from "./scout-cli-harness.ts";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runCli } from "../../pipeline/scout.mts";
import { genreLead } from "../../lib/foundry/scout/leadEvents.ts";
import { leadMark, queueEvents, readQueue } from "../../lib/foundry/scout/leads.ts";
import { createNight, mutateNight, readNight } from "../../lib/foundry/scout/store.ts";

// `scout.mts leads` and `lead` (spark registry-feedback-loop WP-R1): the queue listed, and one
// claim filed per event into <repo>/.ai/registry-leads.jsonl - refused, whole sentence and exit 1,
// for an unknown key, an unknown nearest, a short claim, and a mature claim naming its genre; a
// second filing of a key writes nothing. The written line is held to the registry collector's own
// acceptance (ai-registry scripts/leads-collect.mjs: a parseable ts, a slug bundle, a claim of at
// least 12 characters), restated here, never run. The repo, the registry and every store are temp.

process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(ROOT, "knowledge");
const REPO = path.join(ROOT, "repo");
const REGISTRY = path.join(ROOT, "registry");
const LEDGER = path.join(REPO, ".ai", "registry-leads.jsonl");
const ENV = { ...process.env, GRAVITONE_DRY_ONLY: "1", SCOUT_REPO_DIR: REPO, AI_REGISTRY_DIR: REGISTRY };
const RICH = "https://example.com/talk/lighting";
const RICH_KEY = `source-rich:${RICH}`;
const GENRE_KEY = "genre-publishable:g-velvet";

mkdirSync(path.join(REGISTRY, "knowledge", "media-generation"), { recursive: true });
writeFileSync(path.join(REGISTRY, "knowledge", "media-generation", "index.json"), JSON.stringify({ meta: { bundle: "media-generation" }, subjects: { "cinematic-language": { category: "visual-generation" } } }));
mkdirSync(path.join(REPO, ".ai"), { recursive: true });
mkdirSync(path.join(ROOT, "knowledge", "templates", "cinematic"), { recursive: true });

afterAll(() => disposeRoot());

async function cli(argv: string[], env: Record<string, string | undefined> = ENV): Promise<{ code: number; out: string; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env, out: (s) => out.push(s), err: (s) => err.push(s), ports: { resolve, now: () => new Date("2026-10-23T01:00:00.000Z") } });
  let doc: Record<string, unknown> = {};
  try {
    doc = JSON.parse(out.join("\n")) as Record<string, unknown>;
  } catch {
    /* not a --json call */
  }
  return { code, out: out.join("\n"), err: err.join("\n"), doc };
}

let n = 0;
function file(body: unknown): string {
  const p = path.join(ROOT, `in-${++n}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}
const ledger = (): string => (existsSync(LEDGER) ? readFileSync(LEDGER, "utf8") : "");

/** The collector's acceptance, as scripts/leads-collect.mjs writes it (lines 95-100). */
function collectorAccepts(rec: Record<string, unknown>): boolean {
  const ts = Date.parse(String(rec["ts"] ?? ""));
  const bundle = String(rec["bundle"] ?? "").trim();
  const claim = String(rec["claim"] ?? "").trim();
  return Number.isFinite(ts) && /^[a-z0-9-]+$/.test(bundle) && claim.length >= 12;
}

describe("leads and lead", () => {
  it("leads lists what the commits queued", async () => {
    await queueEvents([
      { key: RICH_KEY, kind: "source-rich", night: "2026-10-21", refs: [RICH], evidence: ["rich: a whole lighting method", `source: ${RICH} (a talk)`, "kept: c-02/text"] },
      genreLead("2026-10-21", { id: "g-velvet", name: "Velvet Noir", use: "late-night romance shorts", cells: ["c-09/piece"], mature: true }),
    ]);
    const r = await cli(["leads", "--json"]);
    expect(r.code, r.err).toBe(0);
    expect((r.doc["pending"] as { key: string }[]).map((e) => e.key)).toEqual([RICH_KEY, GENRE_KEY]);
    const text = await cli(["leads"]);
    expect(text.out).toContain(`${GENRE_KEY}  (genre-publishable, night 2026-10-21, MATURE: craft only)`);
    expect(text.out).toContain("  rich: a whole lighting method");
  });

  it("refuses an unknown key, an unknown nearest, a short claim and a mature claim naming its genre - writing nothing", async () => {
    const good = { claim: "When a practical lamp is in frame, let it motivate the key light", kind: "technique", confidence: "medium" };
    const unknown = await cli(["lead", "source-rich:https://nowhere.example", "--json", file(good)]);
    expect([unknown.code, unknown.err]).toEqual([1, "There is no queued lead source-rich:https://nowhere.example; `scout.mts leads` lists the pending ones."]);
    const nearest = await cli(["lead", RICH_KEY, "--json", file({ ...good, nearest: "lighting-for-video" })]);
    expect([nearest.code, nearest.err]).toEqual([1, `"lighting-for-video" is not a subject of the media-generation index in ${REGISTRY}; name one it holds, or omit nearest.`]);
    const short = await cli(["lead", RICH_KEY, "--json", file({ ...good, claim: "key it" })]);
    expect(short.code).toBe(1);
    expect(short.err).toMatch(/^The lead for source-rich:\S+ is refused: claim - .* \(a claim is 12 to 400 characters/);
    const mature = await cli(["lead", GENRE_KEY, "--json", file({ ...good, claim: "In a velvet noir short, hold the two-shot past the line" })]);
    expect([mature.code, mature.err]).toEqual([1, `The lead for ${GENRE_KEY} comes from a mature genre and its claim names it (velvet, noir); say the craft without the genre's name or use.`]);
    expect(ledger()).toBe("");
    expect((await readQueue()).events.every((e) => e.filed === undefined)).toBe(true);
  });

  it("files one line the collector accepts, ending `because` with the key's mark; a second filing writes nothing", async () => {
    const claim = "When a practical lamp is in frame, let it motivate the key light";
    const r = await cli(["lead", RICH_KEY, "--json", file({ claim, kind: "subject", nearest: "cinematic-language", confidence: "medium" })]);
    expect(r.code, r.err).toBe(0);
    const lines = ledger().split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(collectorAccepts(rec)).toBe(true);
    expect(rec).toEqual({ ts: "2026-10-23T01:00:00.000Z", bundle: "media-generation", nearest: "cinematic-language", kind: "subject", claim, because: `rich: a whole lighting method; source: ${RICH} (a talk); kept: c-02/text ${leadMark(RICH_KEY)}`, confidence: "medium", from: "scout@1" });
    expect(String(rec["because"]).endsWith(`[scout:${RICH_KEY}]`)).toBe(true);
    expect((await readQueue()).events.find((e) => e.key === RICH_KEY)?.filed).toEqual({ at: "2026-10-23T01:00:00.000Z", claim });

    const before = ledger();
    const again = await cli(["lead", RICH_KEY, "--json", file({ claim: "A different phrasing of the same lead, filed twice", kind: "subject", confidence: "low" })]);
    expect(again.code).toBe(0);
    expect(again.doc).toMatchObject({ ok: true, filed: false, already: { claim } });
    expect(ledger()).toBe(before);
    expect((await cli(["leads", "--json"])).doc["pending"]).toHaveLength(1);
  });

  it("a mature event files craft only; with no registry resolvable, nearest is refused and its absence files", async () => {
    const noRegistry = { ...ENV, AI_REGISTRY_DIR: undefined };
    const craft = { claim: "Hold a two-shot one beat past the last line before cutting", kind: "technique", confidence: "low" };
    const named = await cli(["lead", GENRE_KEY, "--json", file({ ...craft, nearest: "cinematic-language" })], noRegistry);
    expect(named.code).toBe(1);
    expect(named.err).toMatch(/^No registry resolves here .* so nearest "cinematic-language" cannot be checked; omit it\.$/);
    const r = await cli(["lead", GENRE_KEY, "--json", file(craft)], noRegistry);
    expect(r.code, r.err).toBe(0);
    const rec = JSON.parse(ledger().split("\n").filter(Boolean).at(-1) ?? "{}") as Record<string, unknown>;
    expect(collectorAccepts(rec)).toBe(true);
    expect("nearest" in rec).toBe(false);
    expect(String(rec["because"])).toMatch(/ \[scout:genre-publishable:g-velvet\]$/);
  });
});

describe("finding restates, source rich", () => {
  it("a source may carry `rich`; a finding's `restates` must name a finding on an existing earlier night", async () => {
    const earlier = await createNight({ dry: true, now: new Date("2026-10-23T00:00:00.000Z") });
    await mutateNight(earlier.id, (x) => ({ ...x, candidates: [{ id: "c-01", kind: "finding", sourceIds: [], status: "rendered", template: "cinematic", step: "02-frames", claim: "Motivate the key", quote: "a reason" }] }));
    const opened = await cli(["open", "--json"]);
    expect(opened.code, opened.err).toBe(0);
    const id = String(opened.doc["night"]);
    const src = await cli(["add-source", id, "--json", file([{ url: RICH, kind: "page", title: "A talk", why: "lighting", found: "search", rich: "a whole lighting method" }])]);
    expect(src.code, src.err).toBe(0);
    expect((await readNight(id)).sources[0]?.rich).toBe("a whole lighting method");
    const f = (restates: string) => file([{ sourceIds: ["s-01"], template: "cinematic", step: "02-frames", claim: "Let a practical motivate the key", quote: "every key has a reason", restates }]);
    expect((await cli(["finding", id, "--json", f("2026-01-01/c-01")])).err).toBe("finding 1: restates 2026-01-01/c-01: No night called 2026-01-01.");
    expect((await cli(["finding", id, "--json", f(`${earlier.id}/c-02`)])).code).toBe(1);
    expect((await cli(["finding", id, "--json", f(`${id}/c-01`)])).code).toBe(1);
    expect((await cli(["finding", id, "--json", f("c-01")])).code).toBe(1);
    const ok = await cli(["finding", id, "--json", f(`${earlier.id}/c-01`)]);
    expect(ok.code, ok.err).toBe(0);
    expect((await readNight(id)).candidates.find((c) => c.kind === "finding")).toMatchObject({ restates: `${earlier.id}/c-01` });
  });
});
