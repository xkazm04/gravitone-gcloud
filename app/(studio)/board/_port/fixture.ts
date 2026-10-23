import "server-only";

// THE FIXTURE BOARD - an in-memory BoardPort with the kernel's rules, so the desks are built and
// driven before the kernel side exists (L21; L24 writes the real one behind ./port.ts). It is
// not a mock that answers yes: every rule a desk depends on is enforced here the way
// @gt/kernel/decision enforces it, so a desk that only works against a lenient fixture is caught
// now, not in wave C:
//   · every write names its base revision; a stale one is `conflict` and writes nothing;
//   · a verdict goes through the source's door (@gt/domain/source checkVerdict);
//   · undo appends the inverse of the newest act not yet undone, captured from what the act
//     overwrote (kernel decision/core.ts planUndo) - a pick is one act;
//   · a blind pair's machine pick, and its arms' labels, exist in a view only once the
//     operator has picked that pair (the EXISTS guard);
//   · commit refuses while anything is undecided (decision 5), refuses a token that no longer
//     matches the decisions and v1's state (`conflict`, detail "stale-preview"), and is
//     idempotent on its ticket;
//   · only a packet review is returned, with a checked edit plan.
// State lives for the server process; `resetFixture` starts it over.

import { createHash } from "node:crypto";

import { checkEditPlan, pickVerdicts, type Consequence, type PacketSummary, type PairView, type PickOutcome } from "@gt/domain/board";
import { parseAt } from "@gt/domain/door";
import type { Decision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import { candidateIdSchema, packetIdSchema, partIdSchema, runIdSchema } from "@gt/domain/ids";
import type { PacketState } from "@gt/domain/packet.machine";
import { checkVerdict, PACKET_SOURCES, reasonVocabulary, SOURCES, type PacketSource } from "@gt/domain/source";
import type { BoardPacket, CommitReceipt, ItemWords, VerdictChange } from "@gt/ui/board/port";

import type { ServerBoard } from "./port.ts";
import { seeds, type Seed } from "./fixtureData.ts";

type V = { readonly verdict: "keep" | "reject"; readonly reasons: readonly string[]; readonly note?: string } | null;
type Change = { readonly candidate: string; readonly before: V; readonly after: V };
type Act = {
  readonly rev: number;
  readonly kind: "import" | "patch" | "pick" | "undo" | "commit";
  readonly changes: readonly Change[];
  readonly pick?: { readonly row: string; readonly before: PickOutcome | null; readonly after: PickOutcome | null };
  readonly undoes?: number;
  readonly at: string;
};
type Pile = {
  readonly seed: Seed;
  state: PacketState;
  readonly acts: Act[];
  digest: string;
  receipt?: { readonly ticket: string; readonly value: CommitReceipt };
  returned?: Parameters<typeof checkEditPlan>[0];
};

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const now = (): string => new Date().toISOString();

// On globalThis, not in module scope: Next may load this module once per server bundle (the
// page, the actions, the keepalive route) and again on every hot reload, and one fixture
// universe must answer all of them.
type Universe = { piles: Map<string, Pile>; epoch: number };
declare global {
  var __gtBoardFixture: Universe | undefined;
}
const universe = (): Universe => (globalThis.__gtBoardFixture ??= { piles: new Map(), epoch: 0 });

function open(seed: Seed): Pile {
  const changes = seed.imported.map((v) => ({ candidate: v.candidate, before: null, after: { verdict: v.verdict, reasons: v.reasons } }));
  const acts: Act[] = changes.length > 0 ? [{ rev: 1, kind: "import", changes, at: "2026-10-15T08:00:00.000Z" }] : [];
  return { seed, state: seed.committed === true ? "committed" : "open", acts, digest: `fixture:${seed.id}:${universe().epoch}` };
}

/** Start every pile over (the live lane's reset). */
export function resetFixture(): void {
  const u = universe();
  u.epoch++;
  u.piles = new Map(seeds().map((s) => [s.id, open(s)]));
}

const isSource = (x: string): x is PacketSource => PACKET_SOURCES.some((s) => s === x);

/** v1's projection names (lib/ledger/v1/sources) where they differ from the packet source's. */
const V1_SOURCE: Readonly<Record<string, string>> = { articles: "article", sound: "audio" };

/**
 * A Floor pile the fixture was not seeded with (`pkt:<v1 source>:<run id>`, from liveNow) opens
 * as a STAND-IN: the seed of its source, under the pile's own id and run, marked a fixture in
 * its oracle and its second line. Without it the Floor's piles could not be driven into the
 * Board before L24's adapters open them from v1 for real; with it nothing pretends to be v1.
 */
function standIn(id: string): Pile | undefined {
  const m = /^pkt:([^:]+):(.+)$/.exec(id);
  if (m === null) return undefined;
  const [, raw = "", runId = ""] = m;
  const source = V1_SOURCE[raw] ?? raw;
  if (!isSource(source)) return undefined;
  // Its own source's seed, else any seed drawn in a mode the source is decided in (extract
  // has no seed of its own and is culled like the forge).
  const modes: readonly string[] = SOURCES[source].modes;
  const seed = seeds().find((x) => x.source === source && x.committed !== true) ?? seeds().find((x) => modes.includes(x.mode) && x.committed !== true);
  if (seed === undefined) return undefined;
  const present = { ...seed.present, meta: `fixture stand-in · ${raw} ${runId}`, oracle: { passed: true, summary: "fixture stand-in", fixture: true } };
  return open({ ...seed, id, source, runId, title: `${raw} ${runId}`, present });
}

function pileOf(id: string): Result<Pile> {
  const u = universe();
  if (u.piles.size === 0) resetFixture();
  let p = u.piles.get(id);
  if (p === undefined) {
    p = standIn(id);
    if (p !== undefined) u.piles.set(id, p);
  }
  return p === undefined ? err("not-found", `board: no packet ${id}`) : ok(p);
}

const revOf = (p: Pile): number => p.acts.at(-1)?.rev ?? 0;
const undone = (p: Pile): Set<number> => new Set(p.acts.flatMap((a) => (a.undoes === undefined ? [] : [a.undoes])));

function current(p: Pile): Map<string, V> {
  const out = new Map<string, V>();
  for (const a of p.acts) for (const c of a.changes) out.set(c.candidate, c.after);
  return out;
}

function picks(p: Pile): Map<string, PickOutcome | null> {
  const out = new Map<string, PickOutcome | null>();
  for (const a of p.acts) if (a.pick !== undefined) out.set(a.pick.row, a.pick.after);
  return out;
}

/** The newest patch or pick no undo has reversed. The import is v1's, not the operator's act. */
const undoTarget = (p: Pile): Act | undefined => {
  const gone = undone(p);
  return [...p.acts].reverse().find((a) => (a.kind === "patch" || a.kind === "pick") && !gone.has(a.rev));
};

function view(p: Pile): BoardPacket {
  const s = p.seed;
  const cur = current(p);
  const pk = picks(p);
  const id = must(parseAt("fixture packet id", packetIdSchema, s.id));
  const decisions: Decision[] = [];
  const at = p.acts.at(-1)?.at ?? now();
  for (const [c, v] of cur) {
    if (v === null) continue;
    decisions.push({ key: `${s.id}::${c}`, verdict: v.verdict, reasons: [...v.reasons], ...(v.note === undefined ? {} : { note: v.note }), rev: revOf(p), by: "operator", surface: "board", at });
  }
  const rows = [...new Set(s.items.flatMap((it) => (it.row === undefined ? [] : [it.row])))];
  const pairs: PairView[] =
    s.mode !== "blind-pair"
      ? []
      : rows.map((row) => {
          const [a, b] = s.items.filter((it) => it.row === row);
          const outcome = pk.get(row) ?? null;
          const ca = must(parseAt("arm", candidateIdSchema, a?.id ?? ""));
          const cb = must(parseAt("arm", candidateIdSchema, b?.id ?? ""));
          const m = s.machine?.[row];
          if (outcome === null || m === undefined) return { row, a: ca, b: cb, outcome };
          const agrees = outcome === "a" || outcome === "b" ? outcome === m : null;
          return { row, a: ca, b: cb, outcome, machine: { candidate: m === "a" ? ca : cb, agrees } };
        });
  // A blind arm's label is the machine's tell as much as its pick is: withheld until judged.
  const hidden = new Set(pairs.filter((pr) => pr.outcome === null).flatMap((pr): string[] => [pr.a, pr.b]));
  const items: Record<string, ItemWords> = Object.fromEntries(Object.entries(s.present.items).filter(([k]) => !hidden.has(k)));
  const gone = undone(p);
  return {
    view: {
      id,
      lane: s.lane,
      source: s.source,
      mode: s.mode,
      state: p.state,
      title: s.title,
      runId: must(parseAt("run id", runIdSchema, s.runId)),
      ...(s.partId === undefined ? {} : { partId: must(parseAt("part id", partIdSchema, s.partId)) }),
      rev: revOf(p),
      items: s.items.map((it) => ({
        id: must(parseAt("candidate id", candidateIdSchema, it.id)),
        ...(it.row === undefined ? {} : { row: it.row }),
        media: { sha256: sha(it.url), bytes: it.url.length, mime: it.mime },
        url: it.url,
        grades: [],
      })),
      decisions,
      undecided: s.items.filter((it) => (cur.get(it.id) ?? null) === null).length,
      canUndo: p.state === "open" && p.acts.some((a) => (a.kind === "patch" || a.kind === "pick") && !gone.has(a.rev)),
      reasons: reasonVocabulary(s.source),
      pairs,
      ...(p.returned === undefined ? {} : { returned: p.returned }),
      ...(p.receipt?.value.apply === undefined ? {} : { apply: p.receipt.value.apply }),
    },
    present: { ...s.present, items },
  };
}

function summary(p: Pile): PacketSummary {
  const v = view(p).view;
  return {
    id: v.id,
    lane: v.lane,
    source: v.source,
    mode: v.mode,
    state: v.state,
    ...(v.title === undefined ? {} : { title: v.title }),
    ...(v.runId === undefined ? {} : { runId: v.runId }),
    rev: v.rev,
    items: v.items.length,
    decided: v.items.length - v.undecided,
    openedAt: "2026-10-15T08:00:00.000Z",
    ...(v.apply === undefined ? {} : { apply: v.apply }),
  };
}

/** A write's preconditions: the pile exists, is open, and the caller read its current revision. */
function writable(id: string, baseRev: number): Result<Pile> {
  const r = pileOf(id);
  if (!r.ok) return r;
  if (r.value.state !== "open") return err("refused", `board: packet ${id} is ${r.value.state}; its verdicts are final`);
  if (baseRev !== revOf(r.value)) return err("conflict", `board: the verdicts moved on (now at revision ${revOf(r.value)}); re-read and try again`);
  return r;
}

function append(p: Pile, act: Omit<Act, "rev" | "at">): number {
  const rev = revOf(p) + 1;
  p.acts.push({ ...act, rev, at: now() });
  return rev;
}

const same = (a: V, b: V): boolean => (a === null || b === null ? a === b : a.verdict === b.verdict && a.reasons.join("|") === b.reasons.join("|") && a.note === b.note);

function patch(id: string, baseRev: number, changes: readonly VerdictChange[]): Result<{ readonly rev: number }> {
  const r = writable(id, baseRev);
  if (!r.ok) return r;
  const p = r.value;
  const members = new Set(p.seed.items.map((it) => it.id));
  const cur = current(p);
  const out: Change[] = [];
  for (const c of changes) {
    if (!members.has(c.candidate)) return err("invalid", `board: candidate ${c.candidate} is not in this packet`);
    const reasons = checkVerdict(p.seed.source, c.note === undefined ? c : { ...c, note: c.note });
    if (!reasons.ok) return reasons;
    const after: V = c.verdict === null ? null : c.note === undefined ? { verdict: c.verdict, reasons: reasons.value } : { verdict: c.verdict, reasons: reasons.value, note: c.note };
    const before = cur.get(c.candidate) ?? null;
    if (!same(before, after)) out.push({ candidate: c.candidate, before, after });
  }
  if (out.length === 0) return ok({ rev: revOf(p) });
  return ok({ rev: append(p, { kind: "patch", changes: out }) });
}

function token(p: Pile): string {
  const cur = [...current(p)].sort(([a], [b]) => a.localeCompare(b));
  return sha(JSON.stringify([cur, p.digest]));
}

/** The consequence a source's adapter would compute from v1's planners, in their words. */
function consequence(p: Pile): Result<Consequence> {
  const s = p.seed;
  const cur = current(p);
  const kept = s.items.filter((it) => cur.get(it.id)?.verdict === "keep");
  const rejected = s.items.filter((it) => cur.get(it.id)?.verdict === "reject");
  const undecided = s.items.length - kept.length - rejected.length;
  if (undecided > 0) return err("refused", `board: a ${s.mode} packet commits only when every candidate is decided; ${undecided} undecided`);
  const words = (id: string): string => s.present.items[id]?.label ?? id;
  const run = `foundry-out/runs/${s.runId}`;
  const base = { packetId: must(parseAt("packet id", packetIdSchema, s.id)), rev: revOf(p), counts: { kept: kept.length, rejected: rejected.length, undecided: 0 }, renames: [], v1Digest: p.digest, token: token(p) };
  switch (s.source) {
    case "forge":
    case "extract":
    case "strips":
      return ok({
        ...base,
        deletes: rejected.map((it) => ({ target: `${run}/${it.id}.png`, candidate: it.id })),
        writes: [{ kind: "file", target: `${run}/verdicts.json` }, ...kept.map((it) => ({ kind: "index-row" as const, target: "pipeline/foundry/styles.json", candidate: it.id, detail: words(it.id) }))],
        promotions: kept.map((it) => ({ target: `style ${words(it.id)}`, candidate: it.id, detail: "candidate → proven" })),
        nearDuplicates: kept.length > 1 && kept[0] !== undefined && kept[1] !== undefined ? [{ candidate: kept[1].id, of: kept[0].id, distance: 0.08 }] : [],
        outward: [],
      });
    case "article":
      return ok({
        ...base,
        deletes: [],
        writes: [{ kind: "file", target: `articles-out/${s.runId}/state.json`, detail: kept.length > 0 ? "approved" : "rejected" }],
        promotions: kept.map((it) => ({ target: `post ${s.title}`, candidate: it.id })),
        nearDuplicates: [],
        outward: kept.length > 0 ? [{ kind: "pull-request", sentence: `push branch article/${s.slug ?? s.runId} to ai-registry and open a PR` }] : [],
      });
    default:
      return ok({
        ...base,
        deletes: [],
        writes: [{ kind: "index-row", target: `${s.source} ledger`, detail: `${kept.length} kept · ${rejected.length} dropped` }],
        promotions: kept.map((it) => ({ target: `library ${words(it.id)}`, candidate: it.id })),
        nearDuplicates: [],
        outward: [],
      });
  }
}

const board: ServerBoard = {
  loadPacket: async ({ id }) => {
    const r = pileOf(id);
    return r.ok ? ok(view(r.value)) : r;
  },
  listPackets: async () => {
    if (universe().piles.size === 0) resetFixture();
    return ok({ packets: [...universe().piles.values()].map(summary), truncated: false });
  },
  patch: async ({ id, baseRev, changes }) => patch(id, baseRev, changes),
  undo: async ({ id, baseRev }) => {
    const r = writable(id, baseRev);
    if (!r.ok) return r;
    const p = r.value;
    const target = undoTarget(p);
    if (target === undefined) return err("refused", `board: nothing on packet ${id} is left to undo`);
    const changes = [...target.changes].reverse().map((c) => ({ candidate: c.candidate, before: c.after, after: c.before }));
    const pick = target.pick === undefined ? {} : { pick: { row: target.pick.row, before: target.pick.after, after: target.pick.before } };
    return ok({ rev: append(p, { kind: "undo", changes, undoes: target.rev, ...pick }) });
  },
  pick: async ({ id, baseRev, pair, outcome }) => {
    const r = writable(id, baseRev);
    if (!r.ok) return r;
    const p = r.value;
    if (p.seed.mode !== "blind-pair") return err("refused", `board: only a blind pair is picked; ${id} is a ${p.seed.mode}`);
    const arms = p.seed.items.filter((it) => it.row === pair);
    const [a, b] = arms;
    if (a === undefined || b === undefined) return err("invalid", `board: no pair ${pair} in ${id}`);
    const [va, vb] = pickVerdicts(p.seed.source, outcome);
    const cur = current(p);
    const changes: Change[] = [
      { candidate: a.id, before: cur.get(a.id) ?? null, after: { verdict: va, reasons: [] } },
      { candidate: b.id, before: cur.get(b.id) ?? null, after: { verdict: vb, reasons: [] } },
    ];
    return ok({ rev: append(p, { kind: "pick", changes, pick: { row: pair, before: picks(p).get(pair) ?? null, after: outcome } }) });
  },
  preview: async ({ id }) => {
    const r = pileOf(id);
    if (!r.ok) return r;
    if (r.value.state !== "open") return err("refused", `board: packet ${id} is ${r.value.state}`);
    return consequence(r.value);
  },
  commit: async ({ id, rev, token: t, ticket }) => {
    const r = pileOf(id);
    if (!r.ok) return r;
    const p = r.value;
    if (p.receipt !== undefined) return p.receipt.ticket === ticket ? ok(p.receipt.value) : err("conflict", `board: packet ${id} was committed under another ticket`);
    if (p.state !== "open") return err("refused", `board: packet ${id} is ${p.state} and cannot be committed`);
    const c = consequence(p);
    if (!c.ok) return c;
    if (rev !== revOf(p) || t !== c.value.token) return err("conflict", "board: the decisions or v1's state changed since the preview", { detail: "stale-preview" });
    p.state = "committed";
    const value: CommitReceipt = { packetId: id, rev: revOf(p), kept: c.value.counts.kept, rejected: c.value.counts.rejected, at: now(), apply: { act: "commit", state: "applied", attempts: 1 } };
    p.receipt = { ticket, value };
    return ok(value);
  },
  returnPacket: async ({ id, rev, plan }) => {
    const r = writable(id, rev);
    if (!r.ok) return r;
    const p = r.value;
    if (p.seed.mode !== "packet-review") return err("refused", `board: only a packet review is sent back; ${id} is a ${p.seed.mode}`);
    const checked = checkEditPlan(plan);
    if (!checked.ok) return checked;
    p.state = "returned";
    p.returned = checked.value;
    return ok({ rev: revOf(p) });
  },
};

export function fixtureBoard(): ServerBoard {
  return board;
}
