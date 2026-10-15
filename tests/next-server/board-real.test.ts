// THE REAL BOARD PORT (app/(studio)/board/_port/real.ts) over the fixture universe, generated
// into a temp directory: v1's real stores and readers, the real decision adapters, the real
// kernel in a temp file with a clock the test moves. What only the port adds is asserted here
// - the adapters' own behaviour is tests/next-server/decision-v1-*.test.ts's:
//   · a Weir pile opens on first sight with v1's verdicts, and is never re-opened after (ruling 6);
//   · a bare aggregate pile resolves to the pile it is now (ruling 4);
//   · patch, undo, preview, commit: one kernel act each; a commit re-reads v1 and a stale preview
//     is the kernel's 409; a second commit with the same ticket is the first result;
//   · the apply outbox: kicked after the commit, delivered through v1's own writers; a failure
//     is retried by the reconciler once due; a redriven stuck row lands;
//   · a blind pair's arm words are withheld until its pair is judged (ruling 9);
//   · an article return v1 would refuse is refused before the kernel records it (ruling 7);
//   · the rail lists unopened Weir piles beside the kernel's packets, never twice.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-board-real-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["NEXT_PUBLIC_GRAVITONE_DATA"] = "fixtures";
  for (const v of ["FOUNDRY_DIR", "SOUND_STORE_DIR", "GRAVITONE_STORE_PATH"]) delete process.env[v];
  // Articles and strips ignore the universe switch (pipeline/fixtures/work.ts): point them at the seed.
  process.env["ARTICLES_STORE_DIR"] = path.join(dir, "fixtures-out", "articles");
  return dir;
});

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import type { PacketId } from "@gt/domain/ids";
import { redriveApply, takeApply, type Applier } from "@gt/kernel/decision/apply";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";
import { queryEvents } from "@gt/kernel/events-query";

import { generate as generateFoundry } from "../../pipeline/fixtures/foundry.ts";
import { generate as generateSound } from "../../pipeline/fixtures/sound.ts";
import { generate as generateWork } from "../../pipeline/fixtures/work.ts";
import { makeRealBoard } from "../../app/(studio)/board/_port/real.ts";
import { applier, drainNow, reconcileApplies } from "../../lib/decision/v1/applier.ts";
import { V1_SOURCES } from "../../lib/ledger/v1/sources.ts";
import { liveJobs, v1Ctx } from "../../lib/ledger/v1/sync.ts";

generateFoundry();
generateWork();
generateSound();
// The strips store's root is foundry-out/ in both universes; the seed wrote fixtures-out/.
cpSync(path.join(ROOT, "fixtures-out", "strips"), path.join(ROOT, "foundry-out", "strips"), { recursive: true });
// The seed's article at the gate has no post to review (work.ts writes run.json alone); give it one.
const post = path.join(ROOT, "fixtures-out", "articles", "fx-art-gate", "post");
mkdirSync(post, { recursive: true });
writeFileSync(path.join(post, "post.md"), ["# Delivery guarantees", "", "At least once.", "", "## The outbox", "", "A row in the same transaction.", "", "## Idempotent writers", "", "The second call is a no-op.", ""].join("\n"));
writeFileSync(path.join(post, "index.html"), "<h1>Delivery guarantees</h1>");
// And its finished music video names an export it never wrote (work.ts mv()): a placeholder.
mkdirSync(path.join(ROOT, "fixtures-out", "sound", "mv", "mj-0c0c0c0c03"), { recursive: true });
writeFileSync(path.join(ROOT, "fixtures-out", "sound", "mv", "mj-0c0c0c0c03", "video.mp4"), "placeholder export");

let now = Date.parse("2026-10-15T12:00:00.000Z");
const k = openKernel(path.join(ROOT, "store.sqlite"), { clock: () => new Date(now) });
if (!k.ok) throw k.error;
const store: Store = k.value.store;
afterAll(() => {
  k.value.close();
  rmSync(ROOT, { recursive: true, force: true });
});

const kicked: string[] = [];
const board = makeRealBoard({
  store: () => ok(store),
  weir: async () => (await liveJobs(V1_SOURCES, v1Ctx())).weir,
  kick: (_s, id) => kicked.push(id),
});
const who = { who: "op-test" };

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`);
  return r.value;
}

async function weirIds(source: string): Promise<string[]> {
  return (await liveJobs(V1_SOURCES, v1Ctx())).weir.filter((w) => w.source === source).map((w) => w.packetId ?? "");
}

const eventTypes = (id: string): string[] => {
  const q = must(queryEvents(store, { subject: { ids: [id] }, limit: 200 }));
  return q.events.map((e) => e.type);
};

describe("the real Board port over the fixture universe", () => {
  it("opens a forge pile on first sight with v1's verdicts, and never re-opens it after v1 moves", async () => {
    const [id] = await weirIds("forge");
    if (id === undefined) throw new Error("the fixtures hold no forge pile");
    const first = must(await board.loadPacket({ id }, who));
    expect(first.view.state).toBe("open");
    expect(first.view.items.length).toBeGreaterThan(0);
    expect(first.view.items.every((it) => it.url.startsWith("/api/foundry/file?"))).toBe(true);
    expect(Object.keys(first.present.items).length).toBe(first.view.items.length);
    expect(eventTypes(id)).toEqual(["decision.opened"]);
    // v1 moves under the open packet (a verdict written on v1's own page): a re-open would be
    // the kernel's "already open with other content" conflict; the stored packet is read instead.
    const run = first.view.runId ?? "";
    const file = path.join(ROOT, "fixtures-out", "runs", run, "verdicts.json");
    const v = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const undecided = first.view.items.find((it) => !first.view.decisions.some((d) => d.key.endsWith(`::${it.id}`)));
    if (undecided !== undefined) {
      v[undecided.id] = { verdict: "keep", at: "2026-10-15T11:00:00.000Z", by: "human" };
      writeFileSync(file, JSON.stringify(v));
    }
    const again = must(await board.loadPacket({ id }, who));
    expect(again.view.rev).toBe(first.view.rev);
    expect(eventTypes(id)).toEqual(["decision.opened"]);
  });

  it("patch, undo, preview and commit are one kernel act each; the commit re-reads v1 and kicks the apply", async () => {
    const [id] = await weirIds("forge");
    if (id === undefined) throw new Error("no forge pile");
    let p = must(await board.loadPacket({ id }, who));
    const items = p.view.items.map((it) => it.id);
    const [first] = items;
    if (first === undefined) throw new Error("an empty pile");
    let rev = must(await board.patch({ id, baseRev: p.view.rev, changes: [{ candidate: first, verdict: "reject", reasons: ["style", "craft"] }] }, who)).rev;
    rev = must(await board.undo({ id, baseRev: rev }, who)).rev;
    // A stale base is the kernel's 409, and writes nothing.
    const stale = await board.patch({ id, baseRev: rev - 1, changes: [{ candidate: first, verdict: "keep", reasons: [] }] }, who);
    expect(stale.ok ? "" : stale.error.code).toBe("conflict");
    rev = must(await board.patch({ id, baseRev: rev, changes: items.map((c, i) => ({ candidate: c, verdict: i % 2 === 0 ? "keep" : "reject", reasons: i % 2 === 0 ? [] : ["subject"] })) }, who)).rev;
    const c1 = must(await board.preview({ id }));
    expect(c1.counts).toEqual({ kept: Math.ceil(items.length / 2), rejected: Math.floor(items.length / 2), undecided: 0 });
    // The decisions move after the preview: its token is stale, and the commit says so.
    rev = must(await board.patch({ id, baseRev: rev, changes: [{ candidate: first, verdict: "reject", reasons: [] }] }, who)).rev;
    const refused = await board.commit({ id, rev, token: c1.token, ticket: "ticket-forge-1" }, who);
    expect(refused.ok ? "" : refused.error.detail).toBe("stale-preview");
    const c2 = must(await board.preview({ id }));
    const receipt = must(await board.commit({ id, rev, token: c2.token, ticket: "ticket-forge-1" }, who));
    expect(receipt.kept + receipt.rejected).toBe(items.length);
    expect(receipt.apply?.state).toBe("pending");
    expect(kicked).toContain(id);
    // Idempotent on the ticket; another ticket is a conflict, never a second act.
    expect(must(await board.commit({ id, rev, token: c2.token, ticket: "ticket-forge-1" }, who)).at).toBe(receipt.at);
    const twice = await board.commit({ id, rev, token: c2.token, ticket: "ticket-forge-2" }, who);
    expect(twice.ok ? "" : twice.error.code).toBe("conflict");
    // The apply, through v1's own writers: the run is committed in v1 and its verdicts are the kernel's.
    const delivered = must(await drainNow(store, { packetId: receipt.packetId as PacketId }));
    expect(delivered.map((d) => d.result)).toEqual(["applied"]);
    const run = p.view.runId ?? "";
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "fixtures-out", "runs", run, "run.json"), "utf8")) as { status: string };
    expect(manifest.status).toBe("committed");
    p = must(await board.loadPacket({ id }, who));
    expect(p.view.state).toBe("committed");
    expect(p.view.apply?.state).toBe("applied");
    expect(eventTypes(id)).toEqual(expect.arrayContaining(["decision.patched", "decision.undone", "decision.committed", "decision.applied"]));
  });

  it("a bare aggregate pile resolves to the pile it is now, and the rail does not list it twice", async () => {
    const [bare] = await weirIds("sound");
    expect(bare).toBe("pkt:audio:audio/triage");
    const p = must(await board.loadPacket({ id: bare ?? "" }, who));
    expect(p.view.id).toMatch(/^pkt:audio:audio\/triage\/\d+$/);
    expect(p.view.mode).toBe("matrix-cull");
    // v1 moves under the open pile (its oldest take judged on the Library page): loading the bare
    // id again reads the open pile, and is not the kernel's "already open with other content".
    const file = path.join(ROOT, "fixtures-out", "sound", "takes.json");
    const shelf = JSON.parse(readFileSync(file, "utf8")) as { takes: { id: string; verdict: string; createdAt: string; judgedAt: string | null }[] };
    const oldest = shelf.takes.filter((t) => p.view.items.some((it) => it.id === t.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (oldest === undefined) throw new Error("an empty audio pile");
    oldest.verdict = "kept";
    oldest.judgedAt = "2026-10-15T11:00:00.000Z";
    writeFileSync(file, JSON.stringify(shelf));
    expect(must(await board.loadPacket({ id: bare ?? "" }, who)).view.id).toBe(p.view.id);
    const rail = must(await board.listPackets());
    expect(rail.packets.filter((x) => x.id.startsWith("pkt:audio:")).map((x) => x.id)).toEqual([p.view.id]);
    // Piles nobody opened are listed too, as open and untouched.
    expect(rail.packets.some((x) => x.source === "strips" && x.rev === 0)).toBe(true);
  });

  it("withholds a blind arm's words until its pair is judged", async () => {
    const ids = await weirIds("dojo");
    let blind: Awaited<ReturnType<typeof board.loadPacket>> | undefined;
    for (const id of ids) {
      const p = await board.loadPacket({ id }, who);
      if (p.ok && p.value.view.mode === "blind-pair" && p.value.view.pairs.some((x) => x.outcome === null)) {
        blind = p;
        break;
      }
    }
    if (blind === undefined || !blind.ok) throw new Error("the fixtures hold no blind pair to judge");
    const v = blind.value.view;
    const open = v.pairs.find((x) => x.outcome === null);
    if (open === undefined) throw new Error("no unjudged pair");
    expect(blind.value.present.items[open.a]).toBeUndefined();
    expect(blind.value.present.items[open.b]).toBeUndefined();
    must(await board.pick({ id: v.id, baseRev: v.rev, pair: open.row, outcome: "a" }, who));
    const after = must(await board.loadPacket({ id: v.id }, who));
    expect(after.present.items[open.a]?.label).toMatch(/baseline|challenger/);
    expect(after.view.pairs.find((x) => x.row === open.row)?.outcome).toBe("a");
  });

  it("refuses an article return v1 would refuse, before the kernel records it", async () => {
    const [id] = await weirIds("articles");
    if (id === undefined) throw new Error("no article at the gate");
    const p = must(await board.loadPacket({ id }, who));
    const section = p.present.review?.sections[0]?.id ?? "intro";
    const r = await board.returnPacket({ id, rev: p.view.rev, plan: [{ section, directive: "free_text", text: "x".repeat(1990) }, { section, directive: "free_text", text: "y".repeat(500) }] }, who);
    expect(r.ok ? "" : r.error.message).toMatch(/rework note is at most/);
    const still = must(await board.loadPacket({ id }, who));
    expect(still.view.state).toBe("open");
    expect(eventTypes(id)).not.toContain("decision.returned");
  });

  it("a failed apply is retried by the reconciler once due", async () => {
    const [id] = await weirIds("suno");
    const p = must(await board.loadPacket({ id: id ?? "" }, who));
    const rev = must(await board.patch({ id: p.view.id, baseRev: p.view.rev, changes: p.view.items.map((it) => ({ candidate: it.id, verdict: "keep" as const, reasons: [] })) }, who)).rev;
    const c = must(await board.preview({ id: p.view.id }));
    must(await board.commit({ id: p.view.id, rev, token: c.token, ticket: "ticket-suno-1" }, who));
    // v1's write fails once (its sentence verbatim), then the real applier runs.
    const failOnce: Applier = async () => err("unavailable", "sound store busy: another writer holds the lock");
    const first = must(await drainNow(store, { packetId: p.view.id, apply: failOnce }));
    expect(first.map((x) => x.result)).toEqual(["retry"]);
    let view = must(await board.loadPacket({ id: p.view.id }, who)).view;
    expect(view.apply).toMatchObject({ state: "pending", attempts: 1, lastError: "sound store busy: another writer holds the lock" });
    // Not due yet: the reconciler's sweep leaves it.
    const early = must(reconcileApplies(store));
    expect(early.started && must(await early.done)).toEqual([]);
    now += 31_000;
    const due = must(reconcileApplies(store, { apply: applier }));
    expect(due.started && must(await due.done).map((x) => x.result)).toEqual(["applied"]);
    view = must(await board.loadPacket({ id: p.view.id }, who)).view;
    expect(view.apply?.state).toBe("applied");
    const suno = JSON.parse(readFileSync(path.join(ROOT, "fixtures-out", "sound", "suno.json"), "utf8")) as { clips: { id: string; verdict: string | null }[] };
    for (const it of p.view.items) expect(suno.clips.find((x) => x.id === it.id)?.verdict).toBe("keep");
    expect(eventTypes(p.view.id)).toEqual(expect.arrayContaining(["decision.apply-failed", "decision.applied"]));
    // No due row is left for a second sweep.
    now += 31_000;
    expect(must(store.tx((t) => takeApply(t, { holder: "probe" })))).toBeUndefined();
  });

  it("a permanent refusal is stuck at once, drawn with v1's sentence; a redrive delivers it", async () => {
    const [id] = await weirIds("mv");
    const p = must(await board.loadPacket({ id: id ?? "" }, who));
    const rev = must(await board.patch({ id: p.view.id, baseRev: p.view.rev, changes: p.view.items.map((it) => ({ candidate: it.id, verdict: "reject" as const, reasons: [] })) }, who)).rev;
    const c = must(await board.preview({ id: p.view.id }));
    must(await board.commit({ id: p.view.id, rev, token: c.token, ticket: "ticket-mv-1" }, who));
    const refusing: Applier = async () => err("refused", "This job is not settled; it cannot be judged.");
    expect(must(await drainNow(store, { packetId: p.view.id, apply: refusing })).map((x) => x.result)).toEqual(["stuck"]);
    expect(must(await board.loadPacket({ id: p.view.id }, who)).view.apply).toMatchObject({ state: "stuck", lastError: "This job is not settled; it cannot be judged." });
    must(store.tx((t) => redriveApply(t, { by: "operator", surface: "board", packetId: p.view.id })));
    expect(must(await drainNow(store, { packetId: p.view.id })).map((x) => x.result)).toEqual(["applied"]);
    expect(eventTypes(p.view.id)).toEqual(expect.arrayContaining(["decision.apply-stuck", "decision.apply-redriven", "decision.applied"]));
  });
});
