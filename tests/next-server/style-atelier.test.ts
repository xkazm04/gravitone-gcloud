// THE STYLE ATELIER'S FIXTURE SIDE (Phase 5, L51; over the kernel's op core since L54) - driven the
// way the screen drives it: views read, ops at a rev, acts as receipt-then-confirm. The rules it
// holds are the kernel's (COMMON decisions 1-2) through the same door and ratchet
// (@gt/domain/style, @gt/domain/style.ratchet), so these tests are about the WIRING: that the
// door is passed on every write, that a refusal writes nothing, that a token binds the rev, and
// that adopt -> generate (dry) -> judge -> lock runs end to end.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { BlobRef } from "@gt/domain/blob";
import { ok, type Result } from "@gt/domain/errors";
import { STYLE_TRIALS } from "@gt/domain/style.ratchet";
import type { StyleAct, StyleOp, StyleOpOutcome, StyleView } from "@gt/domain/styleView";

import { land, loadStyle, opStyle, recOf, resetStyles, type Media } from "../../app/(studio)/library/style/_port/fixture.ts";
import { actReceipt, confirmAct } from "../../app/(studio)/library/style/_port/fixtureActs.ts";
import { ADOPT_SEEDS, DRY_GRID, SEEDS, presetPlate } from "../../app/(studio)/library/style/_port/fixtureData.ts";
import { styleActSchema } from "../../app/(studio)/library/style/_port/schema.ts";
import { styleJobId } from "../../lib/producers/styleLaunch.ts";

const media: Media = async (file): Promise<Result<BlobRef>> => ok({ sha256: createHash("sha256").update(file).digest("hex"), bytes: file.length, mime: "image/jpeg" });
const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const who = { at: "2026-10-16T12:00:00.000Z", by: "operator" };

async function view(id: string): Promise<StyleView> {
  const r = await loadStyle(id, media);
  if (!r.ok) throw r.error;
  return r.value;
}

async function op(id: string, o: StyleOp, rev?: number): Promise<StyleOpOutcome> {
  const v = await view(id);
  const r = await opStyle({ styleId: id, baseRev: rev ?? v.rev, op: o }, who, media);
  if (!r.ok) throw r.error;
  return r.value;
}

async function run(act: StyleAct): Promise<StyleView> {
  const rc = await actReceipt(act, "dry", NOW, media);
  if (!rc.ok) throw rc.error;
  const done = await confirmAct(act, "dry", rc.value.token, NOW, media);
  if (!done.ok) throw done.error;
  if (done.value.kind !== "launched") throw new Error("stale");
  return done.value.view;
}

beforeEach(() => resetStyles());

// Every picture the fixture can land is a file git tracks, not one that happens to be on disk
// (public/trials/**/*.jpg is gitignored: a fresh clone lacks it).
it("names only committed pictures, for every seed and every dry render it can land", () => {
  const tracked = new Set(execFileSync("git", ["ls-files", "public"], { cwd: process.cwd(), encoding: "utf8" }).split(String.fromCharCode(10)).filter(Boolean));
  const files = [
    ...SEEDS.flatMap((s) => [...s.proofs.map((p) => p.file), ...s.exemplars.map((x) => x.file)]),
    ...Object.values(ADOPT_SEEDS).flatMap((xs) => xs.map((x) => x.file)),
    ...Object.values(DRY_GRID).flatMap((grid) => STYLE_TRIALS.map(() => presetPlate(grid))),
  ];
  expect(files.filter((f) => !tracked.has(`public${f}`))).toEqual([]);
});

describe("the seeded universe reads through the one ratchet", () => {
  it("draws each place on the ratchet with the gate's own sentence", async () => {
    const painted = await view("painted-3d");
    expect(painted.status).toBe("proven");
    expect(painted.block).toBeNull();
    expect(painted.why).toContain("adopt");
    const news = await view("newsprint-cutout");
    expect(news.status).toBe("proven");
    expect(news.lock).toMatchObject({ can: false, blocker: "1 proof still undecided" });
    expect(news.proofs.find((p) => p.id === "pr-nc-exit")?.lineage).toBe("stale");
    expect(news.coverage.filter((c) => c.covered).map((c) => c.problem)).toEqual(["quantity", "inventory"]);
    expect((await view("blueprint")).status).toBe("locked");
    expect((await view("chalk-argument")).lock.blocker).toBe("generate at least one proof first");
  });

  it("counts an agent's keep as evidence shown, never as a vote", async () => {
    const painted = await view("painted-3d");
    const agent = painted.evidence.filter((e) => e.by === "agent");
    expect(agent.length).toBeGreaterThan(0);
    expect(agent.every((e) => !e.counts)).toBe(true);
  });
});

// Two first requests at once (a page read beside an action) seed the world once, not twice.
it("keeps an op that landed while a second first read was still seeding", async () => {
  const slow: Media = (file) => new Promise((done) => setTimeout(() => void media(file).then(done), 0));
  const renamed = opStyle({ styleId: "soft-backlit-bokeh", baseRev: 1, op: { kind: "rename", name: "Bokeh, renamed" } }, who, slow);
  const read = loadStyle("chalk-argument", slow);
  expect((await renamed).ok && (await read).ok).toBe(true);
  expect(await view("soft-backlit-bokeh")).toMatchObject({ name: "Bokeh, renamed", rev: 2 });
});

describe("an op at a rev", () => {
  it("answers conflict with the truth for a stale rev, and writes nothing", async () => {
    const before = await view("newsprint-cutout");
    const out = await op("newsprint-cutout", { kind: "rename", name: "Elsewhere" }, before.rev + 7);
    expect(out.kind).toBe("conflict");
    expect((await view("newsprint-cutout")).name).toBe(before.name);
  });

  it("refuses a lock with the gate's sentence and writes nothing", async () => {
    const before = await view("newsprint-cutout");
    const out = await op("newsprint-cutout", { kind: "lock" });
    expect(out).toMatchObject({ kind: "refused", reason: "cannot lock: 1 proof still undecided" });
    expect((await view("newsprint-cutout")).rev).toBe(before.rev);
  });

  it("keeps a rejection's note and turns an approval into a kept cell", async () => {
    const out = await op("chalk-argument", { kind: "rename", name: "Chalk Argument II" });
    expect(out.kind).toBe("applied");
    const news = await op("newsprint-cutout", { kind: "judge-proof", proofId: "pr-nc-booking", state: "rejected", note: "the room reads full" });
    expect(news.kind).toBe("applied");
    expect(news.view.proofs.find((p) => p.id === "pr-nc-booking")).toMatchObject({ state: "rejected", note: "the room reads full" });
    expect(news.view.evidence.at(-1)).toMatchObject({ run: "sheet:newsprint-cutout", scene: "analogy", verdict: "reject", by: "operator" });
  });

  it("never removes a rejection from the sheet", async () => {
    const out = await op("newsprint-cutout", { kind: "remove-proof", proofId: "pr-nc-flywheel" });
    expect(out.kind).toBe("refused");
    expect((await view("newsprint-cutout")).proofs.some((p) => p.id === "pr-nc-flywheel")).toBe(true);
  });

  // An act's landing is a write like an op's: the ratchet holds there too (nothing unlocks).
  it("refuses an act's landing that would unlock a style, and writes nothing", async () => {
    const bp = await recOf("blueprint", media);
    if (!bp.ok) throw bp.error;
    const { lock: _lock, ...unlocked } = bp.value.style;
    void _lock;
    const out = land("blueprint", bp.value.rev, { ...unlocked, status: "proven" }, who.at, "job:style:blueprint:seeded");
    expect(out.ok ? null : out.error.code).toBe("refused");
    expect(await view("blueprint")).toMatchObject({ status: "locked", rev: bp.value.rev });
  });

  it("freezes a locked block; duplicate is the way on, with the look and none of the sheet", async () => {
    const bp = await view("blueprint");
    if (bp.block === null) throw new Error("blueprint has a block");
    const edit = await op("blueprint", { kind: "set-block", block: { ...bp.block, finish: "glossy" } });
    expect(edit.kind).toBe("refused");
    if (edit.kind === "refused") expect(edit.reason).toContain("duplicate");
    expect((await view("blueprint")).rev).toBe(bp.rev);
    const dup = await op("blueprint", { kind: "duplicate" });
    expect(dup.kind === "applied" ? dup.created : null).toBe("blueprint-copy");
    const copy = await view("blueprint-copy");
    expect(copy).toMatchObject({ status: "candidate", duplicatedFrom: "blueprint", block: bp.block, proofs: [], evidence: [] });
  });
});

describe("acts: a receipt, then a confirm", () => {
  it("prices one plate per chosen trial from the kernel table, and refuses a live read here", async () => {
    const v = await view("chalk-argument");
    const act: StyleAct = { kind: "generate-proofs", styleId: v.id, baseRev: v.rev, trialIds: ["peak-and-fall", "flywheel"] };
    const rc = await actReceipt(act, "dry", NOW, media);
    expect(rc.ok && rc.value.lines.map((l) => [l.key, l.usd])).toEqual([["peak-and-fall", 0.045], ["flywheel", 0.045]]);
    expect(rc.ok && rc.value.totals.usd).toBe(0.09);
    const live = await actReceipt(act, "live", NOW, media);
    expect(live.ok ? null : live.error.code).toBe("refused");
  });

  it("answers the fresh receipt when the style moved after it was priced", async () => {
    const v = await view("chalk-argument");
    const act: StyleAct = { kind: "generate-proofs", styleId: v.id, baseRev: v.rev, trialIds: ["the-exit"] };
    const rc = await actReceipt(act, "dry", NOW, media);
    if (!rc.ok) throw rc.error;
    await op("chalk-argument", { kind: "rename", name: "Chalk, renamed" });
    const done = await confirmAct(act, "dry", rc.value.token, NOW, media);
    expect(done.ok && done.value.kind).toBe("stale");
    expect((await view("chalk-argument")).proofs).toEqual([]);
  });

  // The real side's rule (lib/producers/styleLaunch.ts actRefusal) and the view's `sheet.full`:
  // an approval rendered under an earlier block is not in the reference window.
  it("counts the reference window as the view does: a stale approval leaves room", async () => {
    const trials = STYLE_TRIALS.map((t) => t.id);
    for (const ids of [trials, trials, trials.slice(0, 2)]) {
      const v = await view("newsprint-cutout");
      await run({ kind: "generate-proofs", styleId: v.id, baseRev: v.rev, trialIds: ids });
    }
    const pending = (await view("newsprint-cutout")).proofs.filter((p) => p.state === "pending" && p.id !== "pr-nc-booking");
    for (const p of pending.slice(0, 11)) expect((await op("newsprint-cutout", { kind: "judge-proof", proofId: p.id, state: "approved" })).kind).toBe("applied");
    const v = await view("newsprint-cutout");
    expect(v.proofs.filter((p) => p.state === "approved").length).toBe(14);
    expect(v.sheet.full).toBe(false);
    const rc = await actReceipt({ kind: "generate-proofs", styleId: v.id, baseRev: v.rev, trialIds: ["flywheel"] }, "dry", NOW, media);
    expect(rc.ok ? null : rc.error.message).toBeNull();
  });

  it("names a render's plates afresh after an undecided plate left the sheet", async () => {
    const v = await view("chalk-argument");
    const first = await run({ kind: "generate-proofs", styleId: v.id, baseRev: v.rev, trialIds: ["peak-and-fall", "wish-list"] });
    const gone = first.proofs[0];
    if (gone === undefined) throw new Error("a plate was rendered");
    expect((await op("chalk-argument", { kind: "remove-proof", proofId: gone.id })).kind).toBe("applied");
    const after = await view("chalk-argument");
    const again = await run({ kind: "generate-proofs", styleId: after.id, baseRev: after.rev, trialIds: ["flywheel"] });
    expect(again.proofs.map((p) => p.trialId)).toEqual(["wish-list", "flywheel"]);
    expect(new Set(again.proofs.map((p) => p.id)).size).toBe(2);
  });

  // lib/producers/styleLaunch.ts: one confirm, one job - a second confirm of one token finds it.
  it("answers a second confirm of one receipt with the job the first made, and renders nothing more", async () => {
    const v = await view("chalk-argument");
    const act: StyleAct = { kind: "generate-proofs", styleId: v.id, baseRev: v.rev, trialIds: ["flywheel"] };
    const rc = await actReceipt(act, "dry", NOW, media);
    if (!rc.ok) throw rc.error;
    const first = await confirmAct(act, "dry", rc.value.token, NOW, media);
    const second = await confirmAct(act, "dry", rc.value.token, NOW, media);
    if (!first.ok || first.value.kind !== "launched") throw new Error("the first confirm launched");
    expect(first.value.jobId).toBe(styleJobId(v.id, rc.value.token));
    expect(second.ok && second.value).toMatchObject({ kind: "launched", jobId: first.value.jobId, view: { rev: first.value.view.rev } });
    expect((await view("chalk-argument")).proofs).toHaveLength(1);
  });

  // A trial named twice is two priced plates under one id: the landing's door refuses the second
  // after both were paid for. The act's door refuses it before any price.
  it("admits a render's trials at the door only once each", async () => {
    const act = { kind: "generate-proofs", styleId: "chalk-argument", baseRev: 1, trialIds: ["flywheel", "flywheel"] };
    expect(styleActSchema.safeParse(act).success).toBe(false);
    expect(styleActSchema.safeParse({ ...act, trialIds: ["flywheel", "the-exit"] }).success).toBe(true);
  });

  it("refuses to adopt a candidate (v1's 409, kept)", async () => {
    const rc = await actReceipt({ kind: "adopt", fromStyleId: "soft-backlit-bokeh" }, "dry", NOW, media);
    expect(rc.ok ? null : rc.error.message).toContain("only a proven style is adopted");
  });

  it("drives adopt -> generate (dry) -> judge -> lock end to end", async () => {
    const adopted = await run({ kind: "adopt", fromStyleId: "painted-3d" });
    expect(adopted.block?.palette.map((c) => c.role)).toEqual(["ground", "objects", "accent"]);
    // v1 recipeSlots: the first sentence is the technique, the rest the finish; the subject is a person's to write.
    expect(adopted.block).toMatchObject({ technique: expect.stringMatching(/^Stylised 3D characters/), subject: "", finish: expect.stringMatching(/^Heavy atmospheric haze/) });
    expect(adopted.proofs.every((p) => p.state === "pending" && p.source?.startsWith("forge:"))).toBe(true);
    const trialIds = ["peak-and-fall", "wish-list", "booking-not-meal"];
    const rendered = await run({ kind: "generate-proofs", styleId: "painted-3d", baseRev: adopted.rev, trialIds });
    expect(rendered.proofs.filter((p) => p.lineage === "current").map((p) => p.trialId)).toEqual(trialIds);
    for (const p of rendered.proofs) {
      const out = await op("painted-3d", p.trialId === undefined ? { kind: "judge-proof", proofId: p.id, state: "rejected", note: "a forge plate, not this look" } : { kind: "judge-proof", proofId: p.id, state: "approved" });
      expect(out.kind).toBe("applied");
    }
    const ready = await view("painted-3d");
    expect(ready.lock).toMatchObject({ can: true, blocker: null });
    const locked = await op("painted-3d", { kind: "lock" });
    expect(locked.kind).toBe("applied");
    expect(locked.view).toMatchObject({ status: "locked", lock: { lockedBy: "operator" } });
    expect(locked.view.refs.length).toBe(3);
  });
});
