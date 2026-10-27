import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "@gt/domain/event";
import { ok as okR } from "@gt/domain/errors";
import { decodeRecord, encodeRecord } from "@gt/domain/steps/registry";
import { openKernel, type Kernel } from "../src/kernel.ts";
import { partTrail, readPart, undoPart, writePart, type PartSnapshot } from "../src/parts/driver.ts";
import { compose } from "../src/records/write.ts";
import type { Store } from "../src/store.ts";
import { must, steppingClock } from "./helpers.ts";

// THE PART RECORDS' KERNEL HALF (L36): the record doors, the op log, linear undo by append, the
// stale base, the append-only log. What an op MEANS is lib/parts' (tests/next-server/parts-*).

const OP: Actor = { kind: "operator", id: "op" };
const JOB: Actor = { kind: "machine", id: "job:part:p1/research:run-research:1" };
let open: Kernel[] = [];
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});
function film(): Store {
  const k = must(openKernel(":memory:", { clock: steppingClock("2026-10-16T08:00:00.000Z") }));
  open.push(k);
  const c = compose(k.store, { recipe: "film/trailer" }, OP, { id: "p1" });
  if (!c.ok) throw c.error;
  return k.store;
}
const AT = { projectId: "p1", partId: "p1/research" };
const scope = (descoped: boolean) => ({ scope: { c1: { descoped, liked: false, deepen: false } }, confirmed: null });
const set = (records: Readonly<Record<string, unknown>>) => () => okR(records);
const rec = (s: Store, key: string) => must(readPart(s, AT)).records.get(key);
const count = (s: Store, sql: string) => Number(must(s.read((r) => r.get(sql)))?.["n"]);

describe("the step record doors (v1 registry rules)", () => {
  it("reads an absent v as v1, refuses a future v, refuses a malformed shape", () => {
    expect(must(decodeRecord("research", { topic: "x" }))).toMatchObject({ v: 1, topic: "x", researched: false });
    const future = decodeRecord("research-scope", { v: 2, scope: {} });
    expect(future.ok ? "" : `${future.error.code}/${future.error.detail}`).toBe("refused/future");
    const bad = decodeRecord("research-beats", { picks: {} });
    expect(bad.ok ? "" : `${bad.error.code}/${bad.error.detail}`).toBe("invalid/malformed");
    expect(decodeRecord("research-nope", {}).ok).toBe(false);
  });

  it("keeps fields it does not know (a patch never drops a sibling writer's field)", () => {
    expect(must(decodeRecord("cut", { offsets: { a: 40 }, extra: 1 }))).toMatchObject({ offsets: { a: 40 }, extra: 1 });
  });

  it("walks frames v2 up to v3: drops the shadow, refuses base64 plates (the importer's act)", () => {
    const unit = (src?: string) => ({ id: "u1", plate: { state: "ready", ...(src === undefined ? {} : { src }) }, elements: [], texts: [] });
    const up = must(decodeRecord("frames", { v: 2, renderId: "r", units: [unit("/plates/a.png")], frames: [{ id: "u1" }] }));
    expect(up).toMatchObject({ v: 3, units: [{ id: "u1", clip: { status: "not-started", motion: "" } }] });
    expect(Object.hasOwn(up as object, "frames")).toBe(false);
    const inline = decodeRecord("frames", { v: 2, renderId: "r", units: [unit("data:image/png;base64,AAAA")], frames: [] });
    expect(inline.ok ? "" : inline.error.message).toMatch(/base64 bytes/);
    // A browser reads `DATA:` and ` data:` as the same inline bytes: neither walks up, neither is written.
    for (const src of ["DATA:image/png;base64,AAAA", " data:image/png;base64,AAAA"]) {
      expect(decodeRecord("frames", { v: 2, renderId: "r", units: [unit(src)], frames: [] }).ok).toBe(false);
      expect(encodeRecord("frames", { renderId: "r", units: [unit(src)] }).ok).toBe(false);
    }
    expect(encodeRecord("frames", { renderId: "r", units: [], frames: [] }).ok).toBe(false);
    expect(decodeRecord("frames", { renderId: "r", units: [] }).ok).toBe(false);
  });

  it("drops only a damaged staged version, never the ledger beside it", () => {
    const r = must(decodeRecord("script-versions", { accepted: [{ id: "v1", label: "Baseline" }], staged: { nope: 1 } }));
    expect(r).toMatchObject({ accepted: [{ id: "v1" }], stagedDropped: "script-versions.staged is not a staged version" });
    expect(Object.hasOwn(r as object, "staged")).toBe(false);
  });
});

describe("the album and explainer parts hold their own records (L43)", () => {
  const composed = (recipe: string, id: string): Store => {
    const k = must(openKernel(":memory:", { clock: steppingClock("2026-10-16T08:00:00.000Z") }));
    open.push(k);
    const c = compose(k.store, { recipe }, OP, { id });
    if (!c.ok) throw c.error;
    return k.store;
  };

  it("writes an album's words through their door, and refuses words written by the render part", () => {
    const s = composed("album-video", "a1");
    const words = { projectId: "a1", partId: "a1/words" };
    expect(must(readPart(s, words))).toMatchObject({ kind: "words", rev: 1 });
    must(writePart(s, { ...words, baseRev: 1, act: "op", op: {}, label: "title", by: OP, next: set({ words: { title: "Tidewater" } }) }));
    expect(must(readPart(s, words)).records.get("words")).toMatchObject({ v: 1, title: "Tidewater", description: "", tags: [], written: null });
    const render = { projectId: "a1", partId: "a1/render" };
    const reach = writePart(s, { ...render, baseRev: 1, act: "op", op: {}, label: "title", by: OP, next: set({ words: { title: "x" } }) });
    expect(reach.ok).toBe(false);
    must(writePart(s, { ...render, baseRev: 1, act: "op", op: {}, label: "res", by: OP, next: set({ render: { res: "2160p" } }) }));
    expect(must(readPart(s, render)).records.get("render")).toMatchObject({ res: "2160p", exports: [] });
    expect(decodeRecord("render", { res: "480p" }).ok).toBe(false);
  });

  it("holds an explainer's voice takes, and refuses a line naming a take it does not hold", () => {
    const s = composed("explainer", "e1");
    const voice = { projectId: "e1", partId: "e1/voice" };
    const take = { id: "t1", label: "take 1", at: 1, seconds: 2, mark: null, sections: [] };
    must(writePart(s, { ...voice, baseRev: 1, act: "op", op: {}, label: "use", by: OP, next: set({ voice: { takes: { t1: take }, byLine: { "line-a": { takeIds: ["t1"], active: "t1" } } } }) }));
    expect(must(readPart(s, voice)).records.get("voice")).toMatchObject({ byLine: { "line-a": { active: "t1" } } });
    const dangling = decodeRecord("voice", { takes: {}, byLine: { "line-a": { takeIds: ["t9"], active: "t9" } } });
    expect(dangling.ok ? "" : dangling.error.message).toMatch(/does not hold/);
    expect(must(decodeRecord("article", {}))).toMatchObject({ title: null, sections: [] });
    expect(decodeRecord("strips", { cards: [{ id: "c1", section: "s", title: "t", caption: "c", state: "inked" }] }).ok).toBe(false);
  });
});

describe("ops and undo over the part log", () => {
  it("applies an op at its rev, answers a stale base with the current rev and writes nothing", () => {
    const s = film();
    expect(must(readPart(s, AT))).toMatchObject({ kind: "research", rev: 1 });
    expect(must(writePart(s, { ...AT, baseRev: 1, act: "op", op: { op: "descope", cardId: "c1" }, label: "descope c1", by: OP, next: set({ "research-scope": scope(true) }) }))).toEqual({ kind: "applied", rev: 2, n: 1 });
    const stale = must(writePart(s, { ...AT, baseRev: 1, act: "op", op: {}, label: "restore c1", by: OP, next: set({ "research-scope": scope(false) }) }));
    expect(stale).toEqual({ kind: "conflict", rev: 2 });
    expect(rec(s, "research-scope")).toMatchObject({ scope: { c1: { descoped: true } } });
    expect(count(s, "SELECT count(*) AS n FROM events WHERE type = 'part.op'")).toBe(1);
  });

  it("undo appends the inverse - restoring the prior value, absent included - and the log only grows", () => {
    const s = film();
    must(writePart(s, { ...AT, baseRev: 1, act: "op", op: {}, label: "descope c1", by: OP, next: set({ "research-scope": scope(true) }) }));
    must(writePart(s, { ...AT, baseRev: 2, act: "op", op: {}, label: "restore c1", by: OP, next: set({ "research-scope": scope(false) }) }));
    expect(must(undoPart(s, { ...AT, baseRev: 3, by: OP }))).toEqual({ kind: "applied", rev: 4, n: 3 });
    expect(rec(s, "research-scope")).toMatchObject({ scope: { c1: { descoped: true } } });
    must(undoPart(s, { ...AT, baseRev: 4, by: OP }));
    expect(rec(s, "research-scope")).toBeUndefined();
    const none = undoPart(s, { ...AT, baseRev: 5, by: OP });
    expect(none.ok ? "" : none.error.code).toBe("refused");
    expect(count(s, "SELECT count(*) AS n FROM part_ops")).toBe(4);
    expect(count(s, "SELECT count(*) AS n FROM events WHERE type = 'part.undone'")).toBe(2);
  });

  it("is linear: an op after an undo starts the history again, and undo walks back past it", () => {
    const s = film();
    must(writePart(s, { ...AT, baseRev: 1, act: "op", op: {}, label: "a", by: OP, next: set({ research: { topic: "a" } }) }));
    must(writePart(s, { ...AT, baseRev: 2, act: "op", op: {}, label: "b", by: OP, next: set({ research: { topic: "b" } }) }));
    must(undoPart(s, { ...AT, baseRev: 3, by: OP }));
    must(writePart(s, { ...AT, baseRev: 4, act: "op", op: {}, label: "c", by: OP, next: set({ research: { topic: "c" } }) }));
    expect(must(s.read((r) => partTrail(r, AT, 20))).map((x) => x.label)).toEqual(["c", "a"]);
    must(undoPart(s, { ...AT, baseRev: 5, by: OP }));
    expect(rec(s, "research")).toMatchObject({ topic: "a" });
  });

  it("refuses to undo a human edit over a job's later landing, and names the job", () => {
    const s = film();
    must(writePart(s, { ...AT, baseRev: 1, act: "op", op: {}, label: "topic", by: OP, next: set({ "research-notebook": { topic: "t", notebook: null } }) }));
    must(writePart(s, { ...AT, baseRev: "current", act: "land", op: { act: "run-research" }, label: "run-research", by: JOB, next: set({ "research-notebook": { topic: "t", notebook: { facts: [] } } }) }));
    const r = undoPart(s, { ...AT, baseRev: 3, by: OP });
    expect(r.ok ? "" : `${r.error.code}: ${r.error.message}`).toBe(`conflict: topic: research-notebook was rewritten by ${JOB.id} (run-research) since`);
    expect(rec(s, "research-notebook")).toMatchObject({ notebook: { facts: [] } });
  });

  it("refuses a record the part neither owns nor grows, a malformed value, and a no-op", () => {
    const s = film();
    const foreign = writePart(s, { ...AT, baseRev: 1, act: "op", op: {}, label: "x", by: OP, next: set({ score: { spots: [] } }) });
    expect(foreign.ok ? "" : foreign.error.code).toBe("refused");
    const bad = writePart(s, { ...AT, baseRev: 1, act: "op", op: {}, label: "x", by: OP, next: set({ "research-beats": { picks: {} } }) });
    expect(bad.ok ? "" : bad.error.code).toBe("invalid");
    must(writePart(s, { ...AT, baseRev: 1, act: "op", op: {}, label: "x", by: OP, next: set({ research: { topic: "a" } }) }));
    const noop = writePart(s, { ...AT, baseRev: 2, act: "op", op: {}, label: "same", by: OP, next: set({ research: { topic: "a" } }) });
    expect(noop.ok ? "" : noop.error.message).toBe("same: changes nothing");
  });

  it("lets motion grow the frames record while frames keeps owning it", () => {
    const s = film();
    const frames = { projectId: "p1", partId: "p1/frames" };
    const motion = { projectId: "p1", partId: "p1/motion" };
    const units = (motionLine: string) => ({ renderId: "r", units: [{ id: "u1", plate: { state: "empty" }, clip: { status: "not-started", motion: motionLine }, elements: [], texts: [] }] });
    must(writePart(s, { ...frames, baseRev: 1, act: "op", op: {}, label: "seed", by: OP, next: set({ frames: units("") }) }));
    must(writePart(s, { ...motion, baseRev: 1, act: "op", op: {}, label: "accept u1", by: OP, next: (snap: PartSnapshot) => okR({ frames: { ...snap.records.get("frames"), ...units("drifts left") } }) }));
    expect(must(s.read((r) => r.get("SELECT part_id FROM part_records WHERE key = 'frames'")))?.["part_id"]).toBe("p1/frames");
    const undo = undoPart(s, { ...frames, baseRev: 2, by: OP });
    expect(undo.ok ? "" : undo.error.message).toBe("seed: frames was rewritten by op: accept u1 since");
  });

  it("holds the log append-only at the store (the trigger, not a convention)", () => {
    const s = film();
    must(writePart(s, { ...AT, baseRev: 1, act: "op", op: {}, label: "a", by: OP, next: set({ research: { topic: "a" } }) }));
    const upd = s.tx((t) => t.run("UPDATE part_ops SET label = 'b'"));
    expect(upd.ok ? "" : upd.error.message).toMatch(/append-only/);
    const del = s.tx((t) => t.run("DELETE FROM part_ops"));
    expect(del.ok ? "" : del.error.message).toMatch(/append-only/);
  });

  it("refuses a part that holds no step records, and a part not in the project", () => {
    const s = film();
    const gate = readPart(s, { projectId: "p1", partId: "p1/gate:frames" });
    expect(gate.ok ? "" : gate.error.code).toBe("refused");
    const none = readPart(s, { projectId: "p1", partId: "p1/nope" });
    expect(none.ok ? "" : none.error.code).toBe("not-found");
  });
});
