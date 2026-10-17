// THE ARRANGE BOARD'S DOOR - every write the board makes (a card's move, a finalize, a group
// edit, a Suno return), judged against the sound store AS IT IS NOW and written through v1's own
// transaction (lib/sound/store.ts `withStore` + lib/sound/takes.ts `patchTakeTx`/`createTake`,
// the seam the Board's audio adapter writes through, lib/decision/v1/sources/audio.ts), then
// recorded as ONE ledger event.
//
// Absorbed from v1 app/playground/arrange/useArrange.ts and the /api/sound/{takes,groups} routes:
//   · a move patches the head alone (stage + group, + label to finalize); the engine's applyRules
//     still refuses a finalize without a label (409) - this door asks first (admitMove), the
//     store's rule stays the last word;
//   · a Suno return lands KEPT as the head's next version: parentId = the head, origin
//     suno-return, the head's group, technique, terms and prompt, in the stage it was dropped on;
//   · a rename carries every take under the old name, older versions too.
// Upgraded:
//   · the door re-reads the store and refuses a stale gesture (moved since it was picked up, no
//     longer the head) with that sentence - v1 PATCHed whatever the client said;
//   · a group edit and the takes it re-files are ONE store transaction (v1: one PATCH per take,
//     so a refused take left a stack straddling two names);
//   · every write carries the client's op id, which keys its ledger event (appendOnce): a retried
//     move writes nothing new and records once; a retried return finds the take it filed
//     (createTake is idempotent by id, and the id is derived from the op).
// THE ORDER: the sound store commits first, then the event. The store's own rule is the same
// (its verdict ledger is written last, store.ts StoreTx.commit): a crash can lose an event,
// never record a move the store does not hold. A lost event is re-appended by the retry the
// operator's toast asks for, under the same key.
import { err, ok, type AppErrorCode, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { appendOnce, hasKey } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";
import { admitMove, cellOf, nextStage, stackVersions, type Cell, type MoveRequest, type Stage } from "@gt/ui/components/audio/arrange.ts";
import { applyGroupOp, carriedBy, type GroupOp, type Groups } from "@gt/ui/components/audio/arrangeGroups.ts";

import { readGroups, readTakes, SoundError, withStore } from "./store.ts";
import { createTake, patchTakeTx, type IncomingFile } from "./takes.ts";
import type { SoundKind, SoundTake } from "./types.ts";

const STATUS_CODE: Readonly<Record<number, AppErrorCode>> = { 400: "invalid", 403: "refused", 404: "not-found", 409: "refused", 413: "invalid", 415: "invalid", 503: "unavailable" };

/** v1's SoundError (an HTTP status and the engine's sentence) into the one taxonomy. */
async function inStore<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SoundError) return err(STATUS_CODE[e.status] ?? "internal", e.message);
    return err("internal", e instanceof Error ? e.message : String(e), { cause: e });
  }
}

export const OP_ID_RE = /^[a-z0-9]{6,40}$/;
const keyOf = (opId: string): string => `audio-arrange:${opId}`;

type Recorded = { readonly recorded: boolean };

/** The event, after the store committed. A failure is the operator's to retry, said whole. */
function record(kernel: Store, opId: string, input: { readonly actor: Actor; readonly type: string; readonly subject: { readonly kind: string; readonly id: string }; readonly data: Record<string, unknown> }): Result<Recorded> {
  const r = kernel.tx((t) => appendOnce(t, { ...input, lane: "audio", key: keyOf(opId) }));
  if (!r.ok) return err(r.error.code, `the store took the change, the ledger did not: ${r.error.message} - retry it to record it`);
  return ok({ recorded: r.value.appended });
}

/* ── moves ─────────────────────────────────────────────────────────────── */

export type MoveInput = MoveRequest & { readonly opId: string };
export type Moved = { readonly take: SoundTake; readonly already: boolean } & Recorded;

export async function moveTake(kernel: Store, input: MoveInput, actor: Actor, now: Date): Promise<Result<Moved>> {
  const landed = await inStore(() =>
    withStore(async (tx): Promise<Result<{ take: SoundTake; already: boolean; from: Cell }>> => {
      const { takes } = await tx.get("takes");
      const { groups } = await tx.get("groups");
      const kind = takes.find((t) => t.id === input.id)?.kind ?? "music";
      const admit = admitMove(takes, groups[kind], input);
      if (!admit.ok) return admit;
      const before = takes.find((t) => t.id === input.id);
      if (before === undefined) return err("not-found", `no take ${input.id}`);
      const from: Cell = { stage: before.stage ?? "pending", group: before.group };
      if (admit.value.already) return ok({ take: before, already: true, from: input.from });
      const take = await patchTakeTx(tx, input.id, admit.value.patch, now);
      return ok({ take, already: false, from });
    }),
  );
  if (!landed.ok) return landed;
  const { take, already, from } = landed.value;
  const finalized = input.to.stage === "finalized" && from.stage !== "finalized";
  const ev = record(kernel, input.opId, {
    actor,
    type: finalized ? "take.finalized" : "take.moved",
    subject: { kind: "take", id: take.id },
    data: { title: take.title, kind: take.kind, from: { stage: from.stage, group: from.group }, to: { stage: input.to.stage, group: input.to.group }, ...(take.label === null ? {} : { label: take.label }) },
  });
  return ev.ok ? ok({ take, already, recorded: ev.value.recorded }) : ev;
}

/* ── groups ────────────────────────────────────────────────────────────── */

export type GroupInput = { readonly kind: SoundKind; readonly op: GroupOp; readonly opId: string };
export type GroupsEdited = { readonly groups: Groups; readonly carried: number; readonly already: boolean } & Recorded;

export async function editGroups(kernel: Store, input: GroupInput, actor: Actor, now: Date): Promise<Result<GroupsEdited>> {
  // An edit already recorded is ANSWERED, not re-applied: a replayed "add" would otherwise be
  // refused as "already a row" after it had landed.
  const seen = hasKey(kernel, keyOf(input.opId));
  if (!seen.ok) return seen;
  if (seen.value) return inStore(async () => ok({ groups: (await readGroups()).groups, carried: 0, already: true, recorded: false }));
  const landed = await inStore(() =>
    withStore(async (tx): Promise<Result<{ groups: Groups; carried: number }>> => {
      const file = await tx.get("groups");
      const { takes } = await tx.get("takes");
      const kin = takes.filter((t) => t.kind === input.kind);
      const stacks = stackVersions(kin.filter((t) => t.verdict === "kept"));
      const edit = applyGroupOp(file.groups, input.kind, input.op, stacks);
      if (!edit.ok) return err("invalid", edit.error);
      const carried = carriedBy(input.op, input.kind, kin, stacks);
      file.groups = { music: [...edit.groups.music], sfx: [...edit.groups.sfx] };
      tx.touch("groups");
      for (const c of carried) await patchTakeTx(tx, c.id, { group: c.group }, now);
      return ok({ groups: edit.groups, carried: carried.length });
    }),
  );
  if (!landed.ok) return landed;
  const ev = record(kernel, input.opId, { actor, type: "sound.groups.edited", subject: { kind: "sound-groups", id: input.kind }, data: { ...input.op, carried: landed.value.carried } });
  return ev.ok ? ok({ ...landed.value, already: false, recorded: ev.value.recorded }) : ev;
}

/* ── the Suno round trip ───────────────────────────────────────────────── */

export type ReturnInput = { readonly headId: string; readonly stage: Stage; readonly label?: string; readonly opId: string; readonly file: IncomingFile };
export type Returned = { readonly take: SoundTake; readonly version: number; readonly created: boolean } & Recorded;

/** The stages a returned file may land in: the head's own (another pass to come) or one on. */
export function returnStages(head: Stage): readonly Stage[] {
  const next = nextStage(head);
  return next === null ? [head] : [head, next];
}

export async function fileReturn(kernel: Store, input: ReturnInput, actor: Actor, now: Date): Promise<Result<Returned>> {
  const read = await inStore(async () => ok((await readTakes()).takes));
  if (!read.ok) return read;
  const takes = read.value;
  const id = `rt-${input.opId}`;
  const filed = takes.find((t) => t.id === id);
  const h = takes.find((t) => t.id === input.headId);
  if (h === undefined) return err("not-found", `no take ${input.headId} in the sound store`);
  const stack = stackVersions(takes.filter((t) => t.kind === h.kind && t.verdict === "kept")).find((s) => s.versions.some((v) => v.id === h.id));
  if (filed === undefined) {
    if (h.verdict !== "kept" || stack === undefined) return err("refused", `${h.title} is ${h.verdict}; a return answers a kept take`);
    if (stack.head.id !== h.id) return err("conflict", `${h.title} is no longer the card's head: v${stack.versions.length} was filed since`);
    const at = cellOf(stack).stage;
    if (!returnStages(at).includes(input.stage)) return err("invalid", `a return to ${h.title} lands in ${returnStages(at).join(" or ")}, not ${input.stage}`);
  }
  const label = input.label?.trim() ?? "";
  const keep = label !== "" ? label : (h.label ?? "");
  if (input.stage === "finalized" && keep.trim() === "") return err("refused", "a finalized take needs a library label");
  const made = await inStore(async () =>
    ok(
      await createTake(
        {
          id,
          kind: h.kind,
          title: h.title,
          origin: "suno-return",
          provider: "suno",
          op: "manual",
          parentId: h.id,
          group: h.group,
          stage: input.stage,
          verdict: "kept",
          technique: h.technique,
          terms: h.terms,
          prompt: h.prompt,
          negative: h.negative,
          loop: h.loop,
          ...(input.stage === "finalized" ? { label: keep.trim() } : {}),
        },
        input.file,
        now,
      ),
    ),
  );
  if (!made.ok) return made;
  const version = (stack?.versions.length ?? 1) + (made.value.created ? 1 : 0);
  const ev = record(kernel, input.opId, { actor, type: "take.returned", subject: { kind: "take", id: made.value.take.id }, data: { title: h.title, parentId: h.id, stage: input.stage, version, file: input.file.name } });
  return ev.ok ? ok({ take: made.value.take, version, created: made.value.created, recorded: ev.value.recorded }) : ev;
}
