// THE RELEASE STORE'S DOOR FOR lib/ AND THE SERVER (spark studio-to-release WP1): the one writer of the kernel
// `releases` table (packages/kernel/src/releases/). The Server Actions (app/(studio)/audio/_release/acts.ts), the real
// port (../_port/real.ts) and the agent's MCP ops (app/_server/mcp/tools/release.ts, WP2) all come through here.
//
// Every write names the version it was made against: a stale version writes nothing and answers the stored record
// with `stale: true`. Every write appends one `release.*` event in the same transaction, carrying the actor. Who may do
// what is the kernel store's (an agent only proposes), so no caller here can skip it.
//
// "RELEASE THIS" IS THE KEEP (owner, studio-to-release): with `keepTake`, each take is filed kept and finalized with the
// release title as its library label, through the sound store's own writer (lib/sound/takes.ts patchTakeTx, whose
// rules refuse a finalize without a label). THE ORDER, as lib/sound/arrange.ts states it for the same two stores: the
// sound store commits first, then the kernel. A crash between them leaves the take kept with no release; the retry the
// operator presses finds the take already kept and makes the release (the keep is idempotent, and a second press for a
// session's take that already has its release answers that release and writes nothing).
import { randomBytes } from "node:crypto";

import { AppError, err, isAppError, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Release, RightsRecord } from "@gt/domain/release";
import type { ReleaseRecord } from "@gt/domain/release.record";
import { parseRelease } from "@gt/domain/release.schema";
import type { Store } from "@gt/kernel/store";
import { acceptIn, createReleaseIn, dismissIn, editIn, listReleaseRecords, proposeIn, readReleaseRecord } from "@gt/kernel/releases/store";

import { kernel } from "../kernelStore.ts";
import { ID_RE, readTakes, soundFailure, withStore } from "../sound/store.ts";
import { readTakeFacts } from "../sound/suno/facts.ts";
import { patchTakeTx } from "../sound/takes.ts";
import type { SoundTake } from "../sound/types.ts";
import { applyEdit, releaseOf, type ReleaseEdit } from "./draft.ts";
import { shelfTakeOf } from "./shelf.ts";

/** What the agent sends for one field (the shape of @gt/domain/release.record.schema proposalInputSchema). */
export interface ProposalInput {
  readonly path: string;
  readonly value: unknown;
  readonly source: string;
}

export interface WriteOutcome {
  readonly record: ReleaseRecord;
  readonly stale: boolean;
}

/** The operator's acts on a stored release - the shape of app/(studio)/audio/_release/act.ts ReleaseAct (lib/ may not
 *  import app/, so it is spelled here and the wire's type is checked against it where the two meet, ../acts.ts). */
export type ReleaseStoreAct =
  | { readonly kind: "edit"; readonly edit: ReleaseEdit }
  | { readonly kind: "accept"; readonly proposalIds: readonly string[] }
  | { readonly kind: "dismiss"; readonly proposalIds: readonly string[] };

/** The longest library label the sound store files (lib/sound/takes.ts parseTakePatch). */
const LABEL_MAX = 120;
const TAKES_MAX = 40;

function opened(): Result<Store> {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
}

/** Every release, newest first. */
export async function listReleases(): Promise<Result<readonly ReleaseRecord[]>> {
  const s = opened();
  return s.ok ? s.value.read((r) => listReleaseRecords(r)) : s;
}

/** One release; `not-found` when no release has the id. */
export async function readRelease(id: string): Promise<Result<ReleaseRecord>> {
  const s = opened();
  if (!s.ok) return s;
  const r = s.value.read((x) => readReleaseRecord(x, id));
  if (!r.ok) return r;
  return r.value === undefined ? err("not-found", `release: no ${id}`) : ok(r.value);
}

const newReleaseId = (): string => `rel-${randomBytes(6).toString("hex")}`;

/** A take's Suno facts seed its track's rights record: the vendor and the Suno song it came from. Suno's model and the
 *  instant it generated the song are not among the facts the studio files, so they stay null (honest, never guessed). */
async function seededRights(release: Release): Promise<Result<Release>> {
  const facts = await readTakeFacts(release.tracks.map((t) => t.takeId));
  if (!facts.ok) return facts;
  const tracks = release.tracks.map((t) => {
    const f = facts.value[t.takeId];
    if (f === undefined) return t;
    const rights: RightsRecord = { ...t.rights, vendor: "suno", reference: f.sunoClipId === undefined ? t.rights.reference : `suno:${f.sunoClipId}` };
    return { ...t, rights };
  });
  return ok({ ...release, tracks });
}

/** Why these takes cannot make a release, in the work's words; undefined when they can. */
function refusalOf(takes: readonly SoundTake[], ids: readonly string[], keepTake: boolean): string | undefined {
  for (const id of ids) {
    const t = takes.find((x) => x.id === id);
    if (t === undefined) return `no take ${id}`;
    if (t.kind !== "music") return `take ${id} is ${t.kind}; a release is made of music takes`;
    if (!keepTake && t.verdict !== "kept") return `take ${id} is ${t.verdict}; a release is made from kept takes`;
    if (shelfTakeOf(t).durationS <= 0) return `take ${id} has no measured length`;
  }
  return undefined;
}

/** The release a session's "Release this" already made from exactly these takes, if any. */
function madeBefore(s: Store, sessionId: string | null, takeIds: readonly string[]): Result<ReleaseRecord | undefined> {
  if (sessionId === null) return ok(undefined);
  const all = s.read((r) => listReleaseRecords(r));
  if (!all.ok) return all;
  const key = takeIds.join("\n");
  return ok(all.value.find((r) => r.sessionId === sessionId && r.release.status === "draft" && r.release.tracks.map((t) => t.takeId).join("\n") === key));
}

/**
 * A release from takes in the sound store (their order is the track order). With `keepTake` (the studio's "Release
 * this"), each take is also filed kept and finalized with the release title as its label - the owner's ruling that
 * the press IS the keep.
 */
export async function createRelease(input: { readonly takeIds: readonly string[]; readonly sessionId: string | null; readonly keepTake: boolean; readonly by: Actor }): Promise<Result<ReleaseRecord>> {
  const ids = input.takeIds;
  if (ids.length === 0) return err("invalid", "a release needs at least one take");
  if (ids.length > TAKES_MAX) return err("invalid", `a release holds at most ${TAKES_MAX} tracks`);
  if (new Set(ids).size !== ids.length) return err("invalid", "a take is named twice");
  const bad = ids.find((id) => !ID_RE.test(id));
  if (bad !== undefined) return err("invalid", `not a take id: ${JSON.stringify(bad).slice(0, 90)}`);
  if (input.by.kind === "agent") return err("refused", "release: an agent proposes a release's fields; making a release is the operator's");
  const s = opened();
  if (!s.ok) return s;
  const store = s.value;
  if (input.keepTake) {
    const prior = madeBefore(store, input.sessionId, ids);
    if (!prior.ok) return prior;
    if (prior.value !== undefined) return ok(prior.value);
  }
  let release: Release;
  try {
    release = await withStore(async (tx): Promise<Release> => {
      const { takes } = await tx.get("takes");
      const why = refusalOf(takes, ids, input.keepTake);
      if (why !== undefined) throw new AppError("refused", why);
      const picked = ids.map((id) => takes.find((t) => t.id === id)).filter((t): t is SoundTake => t !== undefined);
      const seeded = await seededRights(releaseOf(newReleaseId(), "", picked.map(shelfTakeOf)));
      if (!seeded.ok) throw seeded.error;
      const held = parseRelease(seeded.value);
      if (!held.ok) throw held.error;
      if (input.keepTake) {
        const label = seeded.value.title.trim().slice(0, LABEL_MAX);
        for (const id of ids) await patchTakeTx(tx, id, { verdict: "kept", stage: "finalized", label });
      }
      return seeded.value;
    });
  } catch (e) {
    // An AppError thrown inside the transaction rolled it back (nothing patched) and keeps its code.
    if (isAppError(e)) return err(e.code, e.message);
    return soundFailure(e);
  }
  return store.tx((t) => createReleaseIn(t, { release, sessionId: input.sessionId }, input.by, { takes: [...ids], kept: input.keepTake }));
}

/** The agent's proposals, appended to `pending` (each refused whole when applying it would not pass the release door). */
export async function proposeToRelease(input: { readonly id: string; readonly version: number; readonly proposals: readonly ProposalInput[]; readonly turnId: string | null; readonly by: Actor }): Promise<Result<WriteOutcome>> {
  const s = opened();
  if (!s.ok) return s;
  return s.value.tx((t) => proposeIn(t, { id: input.id, version: input.version, proposals: input.proposals, turnId: input.turnId }, input.by));
}

/** An added track is read from the sound store, never from the page: the take the client named, as the shelf reads it. */
async function fromStore(edit: ReleaseEdit): Promise<Result<ReleaseEdit>> {
  if (edit.type !== "addTrack") return ok(edit);
  const id = edit.take.takeId;
  if (!ID_RE.test(id)) return err("invalid", `not a take id: ${JSON.stringify(id).slice(0, 90)}`);
  try {
    const { takes } = await readTakes();
    const why = refusalOf(takes, [id], false);
    if (why !== undefined) return err("refused", why);
    const take = takes.find((t) => t.id === id);
    return take === undefined ? err("not-found", `no take ${id}`) : ok({ ...edit, take: shelfTakeOf(take) });
  } catch (e) {
    return soundFailure(e);
  }
}

/**
 * The operator's act on a stored release, by compare-and-swap: `edit` runs the wizard's own pure edit (applyEdit) on
 * the STORED release and re-checks it through the door (`release.edited`; the Schedule press is `release.scheduled`);
 * `accept` applies each proposal's value through the door and drops it from pending (`release.accepted`); `dismiss`
 * drops it (`release.dismissed`).
 */
export async function applyToRelease(input: { readonly id: string; readonly version: number; readonly act: ReleaseStoreAct; readonly by: Actor }): Promise<Result<WriteOutcome>> {
  const s = opened();
  if (!s.ok) return s;
  const { id, version, act, by } = input;
  if (act.kind === "accept") return s.value.tx((t) => acceptIn(t, { id, version, proposalIds: act.proposalIds }, by));
  if (act.kind === "dismiss") return s.value.tx((t) => dismissIn(t, { id, version, proposalIds: act.proposalIds }, by));
  if (act.edit.id !== id) return err("invalid", `an edit of ${act.edit.id} was sent to ${id}`);
  const edit = await fromStore(act.edit);
  if (!edit.ok) return edit;
  const e = edit.value;
  const type = e.type === "schedule" ? "release.scheduled" : "release.edited";
  return s.value.tx((t) => editIn(t, { id, version, edit: (r) => applyEdit(r, e), type, data: { edit: e.type } }, by));
}
