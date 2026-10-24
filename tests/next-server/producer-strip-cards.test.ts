// AN EXPLAINER'S STRIPS PART DRAWS ONE FOUNDRY STRIP PER ARTICLE SECTION (spark
// explainer-real-article-strips WP-B), through its receipt and its job, over a kernel store - with
// the strips harness's counted fakes only (./strip-cards-fakes.ts): a seat that writes a page and
// a caption, a capture that writes a real grey poster PNG. Never the operator's seat, never a
// browser. Measured:
//   1. DRY: three sections land three `pending` cards with the sections' own first sentences as
//      captions, no blob, `engine.mode: "dry"` - the seat and the capture never entered;
//   2. LIVE: three `drawn` cards, each with an image/png poster blob (PNG magic bytes) and the
//      turn's caption, one paid turn per card on the meter; a 12-word caption fails the lint and
//      the fix round redoes it; a card failing its gates twice lands `refused` with the gate's words;
//   3. a crash after every effect: no duplicate card, at most the one in-flight turn bought twice,
//      and a resumed job ADOPTS a page that landed before its booking;
//   4. a targeted draw replaces that card alone, and `line-card-<sectionId>` ids are stable.

import { closeAll, disposeRoot, hostA, hostB, operator, ROOT } from "./producer-strips-harness.ts";
import { cardCapture, cardSeat, PNG_MAGIC, type CardSeat } from "./strip-cards-fakes.ts";

import { mkdtempSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.hoisted(() => {
  process.env["SPEND_STORE"] = "memory";
});

import type { BlobRef } from "@gt/domain/blob";
import { parseAt } from "@gt/domain/door";
import { ok, type Result } from "@gt/domain/errors";
import { jobIdSchema } from "@gt/domain/ids";
import { decodeStep } from "@gt/domain/steps/record";
import { STRIPS } from "@gt/domain/steps/parts";
import { blobStore } from "@gt/kernel/blob";
import { enumerateCrashes } from "@gt/kernel/crash";
import type { Effects } from "@gt/kernel/effects";
import { get, list, retry } from "@gt/kernel/job";
import { ackLane } from "@gt/kernel/job-queue";
import { recover, runJob } from "@gt/kernel/job-run";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";
import type { Store } from "@gt/kernel/store";

import { standInCaption } from "../../lib/foundry/strips/brief.ts";
import { linesOf, type ExplainerCard } from "../../lib/cut/explainer.ts";
import { blobRootOf, effectsOf, launchPartAct, partActReceipt } from "../../lib/producers/research.ts";
import { stripCardsProducer, stripCardsSplit, stripCardsUnits, type StripCardsEngines } from "../../lib/producers/stripCards.ts";

afterAll(() => disposeRoot());
const kernels: Kernel[] = [];
afterEach(() => {
  for (const k of kernels.splice(0)) k.close();
  closeAll();
});

const OP = operator;
const NOW = Date.parse("2026-10-24T09:00:00Z");
const ID = "ex1";
const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

const SECTIONS = [
  { id: "intro", heading: "Why scarcity", body: "Bitcoin is scarce by design. Only twenty-one million coins will ever exist.\n\n![a chart](chart.png)\n\nThat cap is written into the code." },
  { id: "supply", heading: "How supply falls", body: "Every four years the reward halves.\n\n```js\nconst reward = 50 / 2 ** halvings;\n```\n\nFewer new coins reach the market each year." },
  { id: "price", heading: "What price needs", body: "Scarcity alone does not make a price. A price needs buyers who believe the scarcity will hold." },
];
const CARDS = SECTIONS.map((s) => `card-${s.id}`);
const GREY: Record<string, number> = { "card-intro": 200, "card-supply": 120, "card-price": 60 };

function explainer(dir = mkdtempSync(path.join(ROOT, "w-"))): { store: Store; dir: string; k: Kernel } {
  const k = must(openKernel(path.join(dir, "k.sqlite"), { snapshotDir: dir }));
  kernels.push(k);
  must(compose(k.store, { recipe: "explainer", title: "Why bitcoin" }, OP, { id: ID }));
  must(writePart(k.store, { projectId: ID, partId: `${ID}/article`, baseRev: "current", act: "land", op: { seed: "article" }, label: "article", by: { kind: "machine", id: "seed" }, next: () => ok({ article: { title: "Why bitcoin", sections: SECTIONS } }) }));
  return { store: k.store, dir, k };
}

const REF = { projectId: ID, partId: `${ID}/strips`, act: "draw-strips" } as const;
function launch(s: Store, mode: "dry" | "live", target?: string): { jobId: string; usd: number | null } {
  const ref = { ...REF, ...(target === undefined ? {} : { target }) };
  const receipt = must(partActReceipt(s, ref, stripCardsUnits, { mode, now: NOW }));
  const l = must(launchPartAct(s, ref, stripCardsUnits, { mode, now: NOW, token: receipt.token, actor: OP, dryOnly: false }));
  if (l.kind !== "launched") throw new Error("stale");
  return { jobId: l.jobId, usd: receipt.lines[0]?.usd ?? null };
}
const drive = (s: Store, jobId: string, eng: StripCardsEngines, dryOnly: boolean, fx: Effects = effectsOf(s)) => runJob(fx, stripCardsProducer("seat.text", {}, eng), jobId, { dryOnly });
const stripsOf = (s: Store) => must(decodeStep(STRIPS, must(readPart(s, { projectId: ID, partId: `${ID}/strips` })).records.get("strips") ?? {}));
const jid = (id: string) => must(parseAt("job id", jobIdSchema, id));

describe("a DRY strip-cards job on a three-section explainer", () => {
  it("lands three pending cards with the sections' first sentences, no blob, the engine dry - and enters neither seat nor capture", async () => {
    const { store } = explainer();
    const seat = cardSeat();
    const cap = cardCapture();
    const { jobId, usd } = launch(store, "dry");
    // The receipt is the worst case, priced: a turn and a fix a card at the strip run's measured $3.20.
    expect(usd).toBeCloseTo(3 * 2 * 3.2, 6);
    const job = must(list(store))[0];
    expect([job?.producer, job?.lane, job?.mode.kind]).toEqual(["strip-cards", "seat.text", "dry"]);
    const report = must(await drive(store, jobId, { seat: seat.seat, capture: cap.capture }, true));
    expect(report.outcome).toBe("done");
    expect(report.wouldCalls?.map((c) => c.provider)).toEqual(["claude-seat", "claude-seat", "claude-seat"]);
    expect([seat.calls, cap.renders]).toEqual([[], []]);
    const rec = stripsOf(store);
    expect(rec.cards).toEqual(SECTIONS.map((s) => ({ id: `card-${s.id}`, section: s.id, title: s.heading, caption: standInCaption(s), state: "pending", why: "dry stand-in: no capture was taken" })));
    expect(rec.cards[0]?.caption).toBe("Bitcoin is scarce by design. Only twenty-one million coins will ever exist. That cap is written into the code.");
    expect(rec.engine).toMatchObject({ mode: "dry", usd: null });
  });

  it("refuses on its receipt while the explainer has no article", () => {
    const { store } = explainer();
    must(writePart(store, { projectId: ID, partId: `${ID}/article`, baseRev: "current", act: "land", op: { seed: "empty" }, label: "article", by: { kind: "machine", id: "seed" }, next: () => ok({ article: { title: null, sections: [] } }) }));
    const r = partActReceipt(store, REF, stripCardsUnits, { mode: "dry", now: NOW });
    expect(r.ok ? "" : r.error.message).toBe("draw strips needs an article");
  });
});

async function posterBytes(s: Store, ref: unknown): Promise<Uint8Array> {
  return must(await blobStore(blobRootOf(s)).read(ref as BlobRef));
}

describe("a LIVE strip-cards job, on the fakes", () => {
  it("lands three drawn cards, each with its PNG poster blob and the turn's caption; one paid turn a card", async () => {
    const { store } = explainer();
    const seat = cardSeat();
    const cap = cardCapture((c) => GREY[c] ?? 0);
    const { jobId } = launch(store, "live");
    const report = must(await drive(store, jobId, { seat: seat.seat, capture: cap.capture }, false));
    expect(report.job?.error?.message).toBeUndefined();
    expect(report.outcome).toBe("done");
    expect(seat.calls).toEqual(CARDS.map((c) => `author:${c}`));
    expect(cap.renders).toEqual(CARDS);
    expect(must(list(store))[0]?.spend.usd).toBeCloseTo(3 * 1.25, 6);
    const rec = stripsOf(store);
    expect(rec.cards.map((c) => [c.id, c.state, c.blob?.mime])).toEqual(CARDS.map((c) => [c, "drawn", "image/png"]));
    for (const c of rec.cards) {
      expect(c.caption).toMatch(new RegExp(`^Narration for ${c.id} word1 `));
      expect(c.caption.split(" ")).toHaveLength(40);
      expect([...(await posterBytes(store, c.blob)).slice(0, 8)]).toEqual(PNG_MAGIC);
    }
    expect(rec.engine).toMatchObject({ mode: "live", usd: 3.75 });
  });

  it("a 12-word caption fails the lint, so the fix round redoes it; a card failing its gates twice is refused in the gate's words", async () => {
    const { store } = explainer();
    const seat = cardSeat((card, fix) => (card === "card-supply" && !fix ? 12 : 40));
    const cap = cardCapture(() => 90, new Map([["card-price", 2]]));
    const { jobId } = launch(store, "live");
    const report = must(await drive(store, jobId, { seat: seat.seat, capture: cap.capture }, false));
    expect(report.outcome).toBe("done");
    expect(seat.calls).toEqual(["author:card-intro", "author:card-supply", "fix:card-supply", "author:card-price", "fix:card-price"]);
    // The 12-word round was never rendered: the lint refused it before the capture.
    expect(cap.renders).toEqual(["card-intro", "card-supply", "card-price", "card-price"]);
    const fixOut = must(store.read((r) => r.get("SELECT output FROM job_outputs WHERE job_id = ? AND step = ?", jobId, "unit:draw:card-supply")));
    expect(JSON.parse(String(fixOut?.["output"]))).toMatchObject({ pass: false, lint: ["caption: 12 words, the bar is 30-60"] });
    const rec = stripsOf(store);
    expect(rec.cards.map((c) => [c.id, c.state])).toEqual([["card-intro", "drawn"], ["card-supply", "drawn"], ["card-price", "refused"]]);
    expect(rec.cards[1]?.caption.split(" ")).toHaveLength(40);
    // Refused with the gate's own words, and its caption still the turn's: it passed its door.
    expect(rec.cards[2]).toMatchObject({ why: "legibility: smallest 18px" });
    expect(rec.cards[2]?.caption).toMatch(/^Narration for card-price /);
    expect(rec.cards[2]?.blob).toBeUndefined();
    expect(must(list(store))[0]?.spend.usd).toBeCloseTo(5 * 1.25, 6);
  });

  it("a targeted draw replaces that card alone; every line id stays the card's", async () => {
    const { store } = explainer();
    const first = cardCapture((c) => GREY[c] ?? 0);
    must(await drive(store, launch(store, "live").jobId, { seat: cardSeat().seat, capture: first.capture }, false));
    const before = stripsOf(store).cards;
    const lines = (cards: readonly ExplainerCard[]) => linesOf(cards, { text: {}, takes: {}, byLine: {} }).map((l) => l.id);
    expect(lines(before as ExplainerCard[])).toEqual(["line-card-intro", "line-card-supply", "line-card-price"]);
    // Every section is drawn: a whole-part draw has nothing left to buy.
    const none = partActReceipt(store, REF, stripCardsUnits, { mode: "live", now: NOW });
    expect(none.ok ? "" : none.error.message).toMatch(/every section of the article is drawn/);
    const seat = cardSeat();
    const again = launch(store, "live", "supply");
    expect(again.jobId).toMatch(/:draw-strips:\d+:supply$/);
    must(await drive(store, again.jobId, { seat: seat.seat, capture: cardCapture(() => 30).capture }, false));
    expect(seat.calls).toEqual(["author:card-supply"]);
    const after = stripsOf(store).cards;
    expect(lines(after as ExplainerCard[])).toEqual(lines(before as ExplainerCard[]));
    expect(after.map((c) => c.blob?.sha256 === before.find((b) => b.id === c.id)?.blob?.sha256)).toEqual([true, false, true]);
  });
});

describe("a LIVE strip-cards job that dies after any effect", () => {
  it("re-lands with no duplicate card, at most the in-flight turn bought twice, and a landed page adopted", async () => {
    type W = { dir: string; k: Kernel; fx: Effects; jobId: string; seat: CardSeat; interrupted: string[] };
    const cap = cardCapture((c) => GREY[c] ?? 0);
    const adopted: number[] = [];
    let n = 0;
    const report = await enumerateCrashes<W>({
      open: () => {
        const w = explainer();
        return { dir: w.dir, k: w.k, fx: effectsOf(w.store), jobId: launch(w.store, "live").jobId, seat: cardSeat(), interrupted: [] };
      },
      reopen: (w) => {
        w.k.close();
        const k = must(openKernel(path.join(w.dir, "k.sqlite"), { snapshotDir: w.dir }));
        kernels.push(k);
        return { ...w, k, fx: effectsOf(k.store) };
      },
      close: (w) => w.k.close(),
      effects: (w) => w.fx,
      scenario: async (fx, w) => {
        must(await runJob(fx, stripCardsProducer("seat.text", {}, { seat: w.seat.seat, capture: cap.capture }), w.jobId, { holder: hostA, alive: () => true, heartbeatMs: 3_600_000, dryOnly: false }));
      },
      recover: async (fx, w) => {
        must(recover(fx, { holder: hostB, alive: (pid) => pid === hostB.pid }));
        const id = jid(w.jobId);
        const j = must(get(w.k.store, id)).job;
        if (j.state === "interrupted") {
          w.interrupted.push(j.interruption?.stage ?? "(between steps)");
          must(ackLane(w.k.store, "seat.text", OP));
          must(retry(w.k.store, id, OP));
        }
        if (must(get(w.k.store, id)).job.state === "queued") must(await runJob(fx, stripCardsProducer("seat.text", {}, { seat: w.seat.seat, capture: cap.capture }), w.jobId, { holder: hostB, alive: (pid) => pid === hostB.pid, dryOnly: false }));
      },
      invariant: (w, phase) => {
        if (phase === "crashed") return undefined;
        n++;
        const job = must(get(w.k.store, jid(w.jobId))).job;
        if (job.state !== "done") return `recovered to ${job.state}${job.error ? `: ${job.error.message}` : ""}`;
        const cards = stripsOf(w.k.store).cards;
        if (cards.map((c) => c.id).join() !== CARDS.join()) return `cards landed as ${cards.map((c) => c.id).join()}`;
        if (cards.some((c) => c.state !== "drawn" || c.blob === undefined)) return `a card is not drawn: ${JSON.stringify(cards.map((c) => c.state))}`;
        const counts = new Map<string, number>();
        for (const c of w.seat.calls) counts.set(c, (counts.get(c) ?? 0) + 1);
        const twice = [...counts.values()].filter((x) => x > 1).length;
        const inFlight = w.interrupted.some((s) => /^unit:(turn|fix):/.test(s));
        if (twice > (inFlight ? 1 : 0)) return `${twice} turn(s) bought twice (${w.seat.calls.join(", ")}); interrupted at ${w.interrupted.join(", ") || "nothing"}`;
        const outs = must(w.k.store.read((r) => r.all("SELECT output FROM job_outputs WHERE job_id = ? AND step LIKE 'unit:turn:%'", w.jobId)));
        adopted.push(outs.filter((o) => (JSON.parse(String(o["output"])) as { adopted?: boolean }).adopted === true).length);
        const rec = w.k.store.read((t) => reconcileJobSpend(t, w.jobId));
        if (!rec.ok || rec.value.drift !== undefined) return `spend drifted from the meter: ${JSON.stringify(rec.ok ? rec.value.drift : rec.error.message)}`;
        return undefined;
      },
    });
    console.log(`[strip-cards] ${report.effects.length} effects, ${report.prefixes} crash points, ${n} recovered worlds checked; ${adopted.filter((a) => a > 0).length} adopted a landed page`);
    expect(report.effects.filter((e) => e.startsWith("call:perform:unit:turn:"))).toHaveLength(3);
    expect(report.effects).toContain("blob");
    expect(report.effects).toContain("tx:part.land");
    expect(report.violations).toEqual([]);
    expect(n).toBeGreaterThan(20);
    // A crash between a turn's land and its booking: the retry adopted the page instead of buying it.
    expect(adopted.some((a) => a > 0)).toBe(true);
  }, 180_000);
});

describe("a whole-part draw under a ceiling, fanned out", () => {
  const WORST = 2 * 3.2;
  const confirm = (s: Store, ceilingUsd: number) => {
    const receipt = must(partActReceipt(s, REF, stripCardsUnits, { mode: "dry", now: NOW, ceilingUsd }));
    return launchPartAct(s, REF, stripCardsUnits, { mode: "dry", now: NOW, ceilingUsd, token: receipt.token, actor: OP, split: stripCardsSplit });
  };
  it("3 cards under 3 x a card's worst + $1: one job a card, each capped at its share, the shares within the confirmed ceiling", () => {
    const { store } = explainer();
    const ceiling = 3 * WORST + 1;
    const l = must(confirm(store, ceiling));
    if (l.kind !== "launched") throw new Error("stale");
    const jobs = must(list(store));
    expect(jobs.map((j) => j.id.split(":").pop())).toEqual(SECTIONS.map((s) => s.id));
    const caps = jobs.map((j) => j.ceilingUsd ?? Number.POSITIVE_INFINITY);
    expect(caps.every((c) => c >= WORST)).toBe(true);
    expect(caps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(ceiling);
  });
  it("a ceiling below one card's worst case is refused with its shortfall, and no job is enqueued", () => {
    const { store } = explainer();
    const r = confirm(store, WORST - 1);
    expect(r.ok ? "" : r.error.message).toBe("the ceiling $5.40 does not cover the 3 jobs' worst case $19.20: $13.80 short");
    expect(must(list(store))).toEqual([]);
  });
  it("with no ceiling, every job runs uncapped as an unsplit act's does", () => {
    const { store } = explainer();
    const receipt = must(partActReceipt(store, REF, stripCardsUnits, { mode: "dry", now: NOW }));
    must(launchPartAct(store, REF, stripCardsUnits, { mode: "dry", now: NOW, token: receipt.token, actor: OP, split: stripCardsSplit }));
    expect(must(list(store)).map((j) => j.ceilingUsd)).toEqual([undefined, undefined, undefined]);
  });
});
