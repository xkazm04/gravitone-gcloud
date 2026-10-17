// DECIDE - the Board's verbs without a browser (Phase 6 L67).
//
//   node pipeline/decide.mts list                                   [--json]
//        the open packets the kernel holds, then v1's Weir piles nobody has opened yet
//   node pipeline/decide.mts show <packet>                          [--json]
//        open it on first sight (as the Board does), print rows, arms and decisions
//   node pipeline/decide.mts pick <packet> <pair> a|b|tie|both-bad  --by agent|operator [--rev n]
//   node pipeline/decide.mts verdict <packet> <candidate> keep|reject|clear --by ... [--reason r]... [--note "..."] [--rev n]
//   node pipeline/decide.mts undo <packet>                          --by ... [--rev n]
//   node pipeline/decide.mts preview <packet>                       [--json]
//        what the commit would do, and the token that commits exactly that
//   node pipeline/decide.mts commit <packet> --token <t>            --by ... [--json]
//        commit, then deliver the packet's apply in this process and say where it landed
//
//   --fixtures   NEXT_PUBLIC_GRAVITONE_DATA=fixtures (lib/fixtures/mode.ts), as ledger-sync
//   --store      the kernel store (default as the app: GRAVITONE_STORE_PATH, else
//                <cwd>/<foundry-out|fixtures-out>/gravitone.sqlite)
//   --who        the actor id the ledger records (default: the `--by` word)
//   Exit 0 done · 1 refused, stale, not found, or the apply did not land · 2 usage.
//
// WHY IT EXISTS. The Dojo gate was rehearsed without a browser through v1's own routes
// (`PUT /api/foundry/training/<id>/verdicts`, `POST .../commit`, .claude/dojo/config.md), which
// wave C deletes. The gate is the Board's dojo packet now (lib/decision/v1/sources/dojo.ts), so
// the headless path is the Board's own path: the kernel's decision driver for every write, each
// source's v1 adapter to open and plan, the apply outbox to deliver - the same calls
// app/(studio)/board/_port/real.ts makes, minus the HTTP. Absorbed from those routes: the blind
// (a pick before the machine's is revealed; arm words withheld on an unjudged pair), and v1's
// refusal of a half-picked claim, which the adapter keeps. Upgraded: a commit carries the
// preview's token, so what lands is what was shown (stale -> exit 1, nothing written), and a
// retried commit is the same act (its ticket is derived from the token), never a second one.
//
// `--by` IS REQUIRED ON EVERY WRITE, with no default. The ledger records who decided, and a
// CLI an agent can run must not record an agent's picks as the operator's because nobody said
// otherwise. The Board's commits are the operator's; a skill rehearsing the gate says `agent`.
//
// The flow mirrors real.ts by hand, not by import: pipeline/ may not import app/
// (tests/golden-path/no-app-imports.probe.spec.ts). Lifting makeRealBoard into lib/ would let
// both call one module; that file belongs to the Board, so the lift is named in the L67 report.

import "./lib-hooks.mts";

import { createHash } from "node:crypto";
import path from "node:path";

import type { Consequence, PacketView, PickOutcome } from "@gt/domain/board";
import type { Result } from "@gt/domain/errors";
import type { PacketSource } from "@gt/domain/source";
import type { Author, By, PatchOutcome } from "@gt/kernel/decision/driver";
import type { Store } from "@gt/kernel/store";

import type { DecisionAdapter, OpenPlan } from "../lib/decision/v1/types.ts";

const args = process.argv.slice(2);
const VERBS = ["list", "show", "pick", "verdict", "undo", "preview", "commit"] as const;
type Verb = (typeof VERBS)[number];
const WRITES: readonly Verb[] = ["pick", "verdict", "undo", "commit"];
const VALUED = new Set(["--store", "--by", "--who", "--rev", "--token", "--reason", "--note"]);
const FLAGS = new Set(["--json", "--fixtures"]);

const isVerb = (v: string | undefined): v is Verb => VERBS.some((x) => x === v);
const positional = args.filter((a, i) => !a.startsWith("--") && !VALUED.has(args[i - 1] ?? ""));
const values = (name: string): string[] => args.flatMap((a, i) => (a === name && args[i + 1] !== undefined ? [args[i + 1] ?? ""] : []));
const value = (name: string): string | undefined => values(name)[0];
const json = args.includes("--json");

function usage(why: string): never {
  console.error(`decide: ${why}\nusage: node pipeline/decide.mts <${VERBS.join("|")}> [<packet>] ... [--by agent|operator] [--json] [--fixtures] [--store <file>]`);
  process.exit(2);
}

const verb = positional[0];
if (!isVerb(verb)) usage(verb === undefined ? "name a verb" : `unknown verb ${verb}`);
const unknown = args.filter((a, i) => a.startsWith("--") && (VALUED.has(a) ? args[i + 1] === undefined : !FLAGS.has(a)));
if (unknown.length > 0) usage(`unknown or valueless flag: ${unknown.join(" ")}`);
const byWord = value("--by");
const by: By | undefined = byWord === "agent" || byWord === "operator" ? byWord : undefined;
if (WRITES.includes(verb) && by === undefined) usage(`${verb} writes a decision: say who decides with --by agent|operator`);
const revWord = value("--rev");
const rev = revWord === undefined ? undefined : Number(revWord);
if (rev !== undefined && (!Number.isInteger(rev) || rev < 0)) usage("--rev is the packet revision you read, a whole number");
const packetArg = positional[1];
if (verb !== "list" && packetArg === undefined) usage(`${verb} needs a packet id (pkt:<source>:<run>)`);

// Read at import by lib/fixtures/mode.ts, so set before anything below loads.
if (args.includes("--fixtures")) process.env["NEXT_PUBLIC_GRAVITONE_DATA"] = "fixtures";
const storeArg = value("--store");
if (storeArg !== undefined) process.env["GRAVITONE_STORE_PATH"] = path.resolve(storeArg);

const { PICK_OUTCOMES } = await import("@gt/domain/board");
const { err, ok } = await import("@gt/domain/errors");
const { parseAt } = await import("@gt/domain/door");
const { packetIdSchema } = await import("@gt/domain/ids");
const { PACKET_SOURCES } = await import("@gt/domain/source");
const { applyStatus } = await import("@gt/kernel/decision/apply");
const { commit: kernelCommit } = await import("@gt/kernel/decision/commit");
const { openPacket, patchMany, pick: kernelPick, undo: kernelUndo } = await import("@gt/kernel/decision/driver");
const { currentDecisions, head } = await import("@gt/kernel/decision/read");
const { listPacketSummaries, readPacketView } = await import("@gt/kernel/decision/view");
const { closeKernel, kernel } = await import("../lib/kernelStore.ts");
const { adapterFor } = await import("../lib/decision/v1/registry.ts");
const { drainNow } = await import("../lib/decision/v1/applier.ts");
const { parsePacketId } = await import("../lib/ledger/v1/packet.ts");

function out(doc: unknown, lines: readonly string[]): void {
  if (json) process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  else for (const l of lines) console.log(l);
}

function done<T>(r: Result<T>, lines: (v: T) => readonly string[]): never {
  closeKernel();
  if (!r.ok) {
    out({ error: r.error.message, code: r.error.code, ...(r.error.detail === undefined ? {} : { detail: r.error.detail }) }, [`decide: ${r.error.code}: ${r.error.message}`]);
    process.exit(1);
  }
  out(r.value, lines(r.value));
  process.exit(0);
}

const author = (): Author => ({ by: by ?? "operator", surface: "cli", who: value("--who") ?? by ?? "operator" });
const isSource = (x: string): x is PacketSource => PACKET_SOURCES.some((s) => s === x);

/* ── the Board's read, as app/(studio)/board/_port/real.ts does it ─────────── */

type Planned = { readonly plan: OpenPlan; readonly v1: unknown; readonly adapter: DecisionAdapter<unknown> };

async function planOf(id: string): Promise<Result<Planned>> {
  const p = parsePacketId(id);
  if (p === null || !isSource(p.source)) return err("not-found", `${id} is not a packet id (pkt:<source>:<run>)`);
  const a = adapterFor(p.source);
  if (!a.ok) return a;
  const v1 = await a.value.read({ runId: p.runId });
  if (!v1.ok) return v1;
  const plan = a.value.packet(v1.value);
  return plan.ok ? ok({ plan: plan.value, v1: v1.value, adapter: a.value }) : plan;
}

const held = (store: Store, id: string): Result<boolean> => store.read((r) => r.get("SELECT 1 AS hit FROM packets WHERE id = ?", id) !== undefined);

/** The packet as the desk draws it; a blind arm's words withheld until its pair is judged (real.ts, ruling 9). */
function viewOf(store: Store, id: string, planned: Planned | undefined) {
  const urls = planned?.plan.urls ?? {};
  const v = store.read((r) => readPacketView(r, id, { mediaUrl: (_b, c) => urls[c] ?? "" }));
  if (!v.ok) return v;
  const words = planned?.plan.present.items ?? {};
  const hidden = new Set(v.value.mode === "blind-pair" ? v.value.pairs.filter((p) => p.outcome === null).flatMap((p): string[] => [p.a, p.b]) : []);
  const items = v.value.items.map((it) => ({ id: it.id, ...(it.row === undefined ? {} : { row: it.row }), url: it.url, ...(hidden.has(it.id) ? {} : { words: words[it.id] }) }));
  return ok({ ...v.value, items, losses: planned?.plan.losses ?? [] });
}

/** Open on first sight, exactly once; a bare aggregate resolves to the pile it is now. */
async function openOf(store: Store, id: string): Promise<Result<{ readonly id: string; readonly planned?: Planned }>> {
  const h = held(store, id);
  if (!h.ok) return h;
  const planned = await planOf(id);
  if (h.value) return ok({ id, ...(planned.ok ? { planned: planned.value } : {}) });
  if (!planned.ok) return planned;
  const p = planned.value.plan;
  const resolved = p.packet.id;
  const already = resolved === id ? ok(false) : held(store, resolved);
  if (!already.ok) return already;
  if (!already.value) {
    const opened = store.tx((t) => openPacket(t, { packet: p.packet, initial: p.initial, ...(p.machinePicks === undefined ? {} : { machinePicks: p.machinePicks }) }, author()));
    if (!opened.ok) return opened;
  }
  return ok({ id: resolved, planned: planned.value });
}

const showLines = (v: { readonly id: string; readonly mode: string; readonly state: string; readonly rev: number; readonly undecided: number } & Pick<PacketView, "pairs" | "decisions">): string[] => [
  `${v.id}  ${v.mode}  ${v.state}  rev ${v.rev}  ${v.undecided} undecided`,
  ...v.pairs.map((p) => `  pair ${p.row.padEnd(28)} a ${p.a}  b ${p.b}  ${p.outcome ?? "-"}${p.machine === undefined ? "" : `  machine ${p.machine.candidate}${p.machine.agrees === null ? "" : p.machine.agrees ? " (agrees)" : " (differs)"}`}`),
  ...v.decisions.map((d) => `  ${(d.verdict ?? "clear").padEnd(7)} ${d.key.slice(d.key.indexOf("::") + 2)}  ${d.by}/${d.surface}${d.reasons.length === 0 ? "" : `  ${d.reasons.join(",")}`}`),
];

/* ── the verbs ─────────────────────────────────────────────────────────────── */

const k = kernel();
if (!k.ok) done(k, () => []);
const store = k.value.store;
const pid = packetArg ?? "";

if (verb === "list") {
  const { V1_SOURCES } = await import("../lib/ledger/v1/sources.ts");
  const { liveJobs, v1Ctx } = await import("../lib/ledger/v1/sync.ts");
  const listed = store.read((r) => listPacketSummaries(r, { state: "open", limit: 200 }));
  if (!listed.ok) done(listed, () => []);
  const ids = new Set<string>(listed.value.packets.map((p) => p.id));
  const weir = (await liveJobs(V1_SOURCES, v1Ctx())).weir.filter((w) => w.packetId !== undefined && !ids.has(w.packetId) && ![...ids].some((o) => o.startsWith(`${w.packetId}/`)));
  done(ok({ open: listed.value.packets, unopened: weir.map((w) => ({ id: w.packetId, title: w.title, pending: w.pending })) }), (v) => [
    ...v.open.map((p) => `open      ${p.id}  ${p.mode}  ${p.decided}/${p.items} decided  ${p.title ?? ""}`),
    ...v.unopened.map((w) => `unopened  ${w.id}  ${w.pending} pending  ${w.title}`),
  ]);
}

const opened = await openOf(store, pid);
if (!opened.ok) done(opened, () => []);
const id = opened.value.id;
const planned = opened.value.planned;
const packetId = parseAt("packet id", packetIdSchema, id);
if (!packetId.ok) done(packetId, () => []);
const at = store.read((r) => ({ head: head(r, id), decisions: currentDecisions(r, id).decisions }));
if (!at.ok) done(at, () => []);
const baseRev = rev ?? at.value.head.rev;
/** A write's answer: the kernel's refusal (a stale --rev, a reason off the source's list), or the packet after it. */
const after = (w: Result<PatchOutcome>): never => {
  if (!w.ok) done(w, () => []);
  if (!w.value.ok) done(w.value, () => []);
  const v = viewOf(store, id, planned);
  done(v, showLines);
};

switch (verb) {
  case "show":
    done(viewOf(store, id, planned), showLines);
    break;
  case "pick": {
    const pair = positional[2];
    const outcome = PICK_OUTCOMES.find((o) => o === positional[3]);
    if (pair === undefined || outcome === undefined) usage(`pick needs <pair> and one of ${PICK_OUTCOMES.join("|")}`);
    const picked: PickOutcome = outcome;
    after(store.tx((t) => kernelPick(t, { ...author(), packetId: packetId.value, baseRev, pair, outcome: picked })));
    break;
  }
  case "verdict": {
    const candidate = positional[2];
    const word = positional[3];
    if (candidate === undefined || (word !== "keep" && word !== "reject" && word !== "clear")) usage("verdict needs <candidate> and keep|reject|clear");
    const note = value("--note");
    const verdict: "keep" | "reject" | null = word === "clear" ? null : word;
    const change = { key: `${id}::${candidate}`, verdict, reasons: values("--reason"), ...(note === undefined ? {} : { note }) };
    after(store.tx((t) => patchMany(t, { ...author(), packetId: packetId.value, baseRev, changes: [change] })));
    break;
  }
  case "undo":
    after(store.tx((t) => kernelUndo(t, { ...author(), packetId: packetId.value, baseRev })));
    break;
  case "preview":
  case "commit": {
    // A decided packet is not re-read from v1 (it may refuse once its outcome landed): the kernel
    // answers a retried ticket with the first result and refuses any other (real.ts commit).
    let v1Digest = "";
    let shown: Consequence | undefined;
    if (at.value.head.state === "open") {
      if (planned === undefined) done(err("not-found", `${id}: v1 no longer plans this packet`), () => []);
      const c = planned.adapter.consequence(planned.v1, { packetId: packetId.value, rev: at.value.head.rev, decisions: at.value.decisions });
      if (!c.ok) done(c, () => []);
      v1Digest = c.value.v1Digest;
      shown = c.value.consequence;
    } else if (verb === "preview") done(err("refused", `packet ${id} is ${at.value.head.state}; there is nothing left to preview`), () => []);
    if (verb === "preview") {
      if (shown === undefined) done(err("internal", `${id}: no consequence was read`), () => []);
      done(ok(shown), (v) => [`${id}  kept ${v.counts.kept} · rejected ${v.counts.rejected} · undecided ${v.counts.undecided}`, `token ${v.token}`]);
    }
    const token = value("--token");
    if (token === undefined) usage("commit needs --token <t> from `preview`: what is committed is what was shown");
    const ticket = `cli:${createHash("sha256").update(`${id}\u0000${token}`).digest("hex").slice(0, 32)}`;
    const c = store.tx((t) => kernelCommit(t, { ...author(), packetId: packetId.value, ticket, token, v1Digest }));
    if (!c.ok) done(c, () => []);
    if (!c.value.ok) done(c.value, () => []);
    // Delivered here and awaited: a headless caller has no next render to sweep it.
    const delivered = await drainNow(store, { packetId: packetId.value, max: 1 });
    if (!delivered.ok) done(delivered, () => []);
    const apply = store.read((r) => applyStatus(r, id));
    const landed = apply.ok && (apply.value === undefined || apply.value.state === "applied");
    const doc = { packetId: id, rev: c.value.value.rev, kept: c.value.value.kept.length, rejected: c.value.value.rejected.length, ...(apply.ok && apply.value !== undefined ? { apply: apply.value } : {}) };
    closeKernel();
    out(doc, [`${id} committed at rev ${doc.rev}: kept ${doc.kept}, rejected ${doc.rejected}; apply ${doc.apply?.state ?? "none"}${doc.apply?.lastError === undefined ? "" : ` - ${doc.apply.lastError}`}`]);
    process.exit(landed ? 0 : 1);
  }
}
