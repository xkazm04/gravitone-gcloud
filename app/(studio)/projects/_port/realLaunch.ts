import "server-only";

import { randomBytes } from "node:crypto";

import { err, isAppError, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { ComposerInput, LaunchedRun, Receipt, ReceiptMode } from "@gt/domain/produce";
import type { Effects } from "@gt/kernel/effects";
import { launchRun, runReceipt } from "@gt/kernel/records/launch";
import type { Store } from "@gt/kernel/store";
import { forgeRunOf } from "@gt/producers/forge/plan";

import { DEFAULT_OPTIONS, DEFAULT_SELECTION, type CardSelection } from "../../../../lib/foundry/strips/cards.ts";
import { launchFloorForge, type FloorSweep } from "../../../../lib/producers/forge.ts";
import { launchStrips } from "../../../../lib/producers/strips.ts";
import { launchSunoDraft, sunoKernelId, sunoRunId } from "../../../../lib/producers/suno.ts";
import { SoundError } from "../../../../lib/sound/store.ts";
import { TextError } from "../../../../lib/text/errors.ts";
import { draftJobId } from "../../../../lib/sound/suno/draft.ts";
import type { Confirmed } from "./contract.ts";
import { stripCases } from "./realChoices.ts";

// A FLOOR COMPOSER'S LAUNCH, PER MEDIA LANE - the receipt and the confirm of each lane through the
// door its producer already launches by, so a Floor run is the SAME job record its CLI makes
// (COMMON decision 8, "the same job from UI and CLI"):
//
//   article  L26 `runReceipt` / `launchRun` with the composer's input: the Run and its gate job
//            under one id, which the article producer's create step turns into run.json from the
//            Run's own input (lib/producers/article.ts `ensureRun` - L30 wrote it for this door);
//   video    L33 `launchStrips` (lib/producers/strips.ts): a strips run is a manifest first, so
//            its own door writes run.json naming the job, then the Run and the job in one
//            transaction, priced at the producer's measured worst case on the text seat;
//   image    L45 `launchFloorForge` (lib/producers/forge.ts): a sweep planned from the chosen
//            style(s) over the stock scenes, priced statically, prepared and enqueued on confirm;
//   audio    music: L52 `launchSunoDraft` (lib/producers/suno.ts) - the receipt prices ONE Suno
//            job under an id it mints (`sj-…`, carried in the token as strips' run id is); the
//            confirm drafts the proposal from the sentence (one `suno-propose` turn live, the
//            sentence itself dry - lib/sound/suno/draft.ts), writes its queued record and
//            enqueues the box.chrome job the worker drives, the same job `pipeline/suno.mts`
//            launches. Until Phase 5 this confirm was refused: a Suno take launched only from a
//            proposal already in the queue, and nothing turned a sentence into one.
//            sfx: the records' receipt, and the confirm REFUSED - no sfx producer is bound in
//            this checkout (lib/producers/registry.ts); a job enqueued for it would sit claimed
//            by nobody, and a receipt that launches what cannot run is the defect a receipt
//            exists to prevent.
//
// THE STRIPS RUN ID TRAVELS IN THE TOKEN. A strips receipt prices a NAMED run (its quote key
// digests the run id with its cards), so the receipt mints the id and the confirm must launch
// under that same id - otherwise every confirm would be stale. The port's token is opaque to the
// screens: `<runId>:<kernel token>`. A forged id only changes the digest it is checked against.

export type LaunchContext = {
  readonly store: Store;
  readonly strips: () => Result<{ readonly store: Store; readonly fx: Effects }>;
  readonly now: number;
  readonly dryOnly: boolean;
  readonly cwd: string;
  /** A fresh suffix for a minted id; tests pin it. */
  readonly mint: () => string;
};

type Opts = { readonly mode: ReceiptMode; readonly ceilingUsd?: number };

export type LaneDoor = {
  readonly receipt: (c: LaunchContext, input: ComposerInput, o: Opts) => Result<Receipt> | Promise<Result<Receipt>>;
  readonly launch: (c: LaunchContext, input: ComposerInput, token: string, o: Opts, actor: Actor) => Result<Confirmed<LaunchedRun>> | Promise<Result<Confirmed<LaunchedRun>>>;
};

export const mintSuffix = (): string => `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;

const slug = (s: string, max: number): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "") || "run";

const ceilingOf = (o: Opts): { ceilingUsd?: number } => (o.ceilingUsd === undefined ? {} : { ceilingUsd: o.ceilingUsd });

/**
 * The records' own receipt for a composer input: the catalog option, its lane and its queue. The
 * composer's Estimate is read before a word is typed (the prototype's `Estimate()` on every
 * input), and the records' run door holds a run's text to a sentence - which prices nothing and
 * is not in the token - so an empty one is read as a placeholder here; the LAUNCH door
 * (./actions.ts `composerInputSchema`) still refuses a run with no first sentence.
 */
const recordsReceipt = (c: LaunchContext, input: ComposerInput, o: Opts): Result<Receipt> =>
  runReceipt(c.store, input.text.trim() === "" ? { ...input, text: "…" } : input, { mode: o.mode, ...ceilingOf(o) }, { now: c.now });

/* ── article: the records' door, the producer makes run.json from the Run ───── */

const article: LaneDoor = {
  receipt: recordsReceipt,
  launch(c, input, token, o, actor) {
    if (input.lane !== "article") return err("internal", `article door handed a ${input.lane} input`);
    // lib/articles RUN_ID_RE: lower-case letters, digits and dashes, at most 91 - the id names the run's directory.
    const id = `floor-${slug(input.topic.split("/").at(-1) ?? input.topic, 48)}-${c.mint()}`;
    const l = launchRun(c.store, { input, token, mode: o.mode, ...ceilingOf(o) }, actor, { now: c.now, dryOnly: c.dryOnly, id });
    if (l.ok) return ok({ kind: "launched", runId: l.value.runId, jobId: l.value.jobId });
    if (l.fresh !== undefined) return ok({ kind: "stale", fresh: l.fresh });
    return { ok: false, error: l.error };
  },
};

/* ── video: the strips producer's own door ────────────────────────────────── */

function selectionOf(c: LaunchContext, subject: string): Result<CardSelection> {
  const kase = stripCases(c.cwd).find((x) => x.id === subject);
  return kase === undefined ? err("invalid", `no strip case ${subject} in pipeline/strips/approaches.json`) : ok({ ...DEFAULT_SELECTION, lane: kase.lane, only: kase.approaches });
}

const wrap = (runId: string, r: Receipt): Receipt => ({ ...r, token: `${runId}:${r.token}` });

function unwrap(token: string): { readonly runId: string; readonly inner: string } | undefined {
  const at = token.lastIndexOf(":");
  return at <= 0 ? undefined : { runId: token.slice(0, at), inner: token.slice(at + 1) };
}

async function stripsDoor(c: LaunchContext, input: ComposerInput, o: Opts, actor: Actor, given?: { readonly runId: string; readonly token: string }) {
  if (input.lane !== "video") return err("internal", `strips door handed a ${input.lane} input`);
  const selection = selectionOf(c, input.subject);
  if (!selection.ok) return selection;
  const k = c.strips();
  if (!k.ok) return k;
  const runId = given?.runId ?? `floor-${slug(input.subject, 40)}-${c.mint()}`;
  const r = await launchStrips(
    { kind: "new", runId, selection: selection.value, options: DEFAULT_OPTIONS },
    { mode: o.mode, ...ceilingOf(o), actor, dryOnly: c.dryOnly, now: c.now, binding: { kernel: k.value }, ...(given === undefined ? {} : { token: given.token }) },
  );
  return r.ok ? ok({ runId, out: r.value }) : r;
}

const video: LaneDoor = {
  async receipt(c, input, o) {
    const r = await stripsDoor(c, input, o, { kind: "operator", id: "receipt" });
    if (!r.ok) return r;
    const out = r.value.out;
    return out.kind === "receipt" ? ok(wrap(r.value.runId, out.receipt)) : err("internal", `a strips receipt read answered ${out.kind}`);
  },
  async launch(c, input, token, o, actor) {
    const t = unwrap(token);
    // A token this door never minted: nothing to compare it with, so read the receipt afresh.
    if (t === undefined) {
      const fresh = await video.receipt(c, input, o);
      return fresh.ok ? ok({ kind: "stale", fresh: fresh.value }) : fresh;
    }
    const r = await stripsDoor(c, input, o, actor, { runId: t.runId, token: t.inner });
    if (!r.ok) return r;
    const out = r.value.out;
    switch (out.kind) {
      case "launched":
        return ok({ kind: "launched", runId: out.runId, jobId: out.jobId });
      case "stale":
        return ok({ kind: "stale", fresh: wrap(r.value.runId, out.fresh) });
      case "existing":
        return err("conflict", `strip run ${out.runId} is served by job ${out.jobId} (${out.state}); one job serves a run at a time`);
      case "receipt":
        return err("internal", "a strips confirm answered a receipt");
    }
  },
};

/* ── audio: a Suno take from the sentence; sfx priced and refused ──────────── */

const refused = (why: string): LaneDoor => ({
  receipt: recordsReceipt,
  launch: () => err("unavailable", why),
});

const NO_SFX = "no sfx producer is bound in this checkout (lib/producers/registry.ts); an sfx clip cannot run as a job yet";

async function sunoDoor(c: LaunchContext, input: ComposerInput, o: Opts, actor: Actor, given?: { readonly jobId: string; readonly token: string }) {
  if (input.lane !== "audio") return err("internal", `audio door handed a ${input.lane} input`);
  const jobId = given?.jobId ?? draftJobId(`floor-${c.mint()}`);
  const r = await launchSunoDraft(jobId, { kind: "sentence", text: input.text.trim() === "" ? "…" : input.text }, { mode: o.mode, ...ceilingOf(o), actor, dryOnly: c.dryOnly, now: c.now, store: c.store, ...(given === undefined ? {} : { token: given.token }) });
  return ok({ jobId, out: r });
}

/** A Suno door outcome as a Result: a refusal the producer threw keeps its code. */
async function guarded<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e };
    if (e instanceof SoundError) return err(e.status === 400 ? "invalid" : e.status === 404 ? "not-found" : e.status === 409 ? "conflict" : "unavailable", e.message);
    // The sentence's turn failed (no engine, a timeout, a refusal): the text router's own words.
    if (e instanceof TextError) return err("unavailable", `the Suno prompt could not be drafted: ${e.message}`);
    throw e;
  }
}

const audio: LaneDoor = {
  receipt: (c, input, o) =>
    input.lane === "audio" && input.kind === "sfx"
      ? recordsReceipt(c, input, o)
      : guarded(async () => {
          const r = await sunoDoor(c, input, o, { kind: "operator", id: "receipt" });
          if (!r.ok) return r;
          const out = r.value.out;
          return out.kind === "receipt" ? ok(wrap(r.value.jobId, out.receipt)) : err("internal", `a Suno receipt read answered ${out.kind}`);
        }),
  launch: (c, input, token, o, actor) => {
    if (input.lane === "audio" && input.kind === "sfx") return refused(NO_SFX).launch(c, input, token, o, actor);
    return guarded(async (): Promise<Result<Confirmed<LaunchedRun>>> => {
      const t = unwrap(token);
      if (t === undefined) {
        const fresh = await audio.receipt(c, input, o);
        return fresh.ok ? ok({ kind: "stale", fresh: fresh.value }) : fresh;
      }
      const r = await sunoDoor(c, input, o, actor, { jobId: t.runId, token: t.inner });
      if (!r.ok) return r;
      const out = r.value.out;
      switch (out.kind) {
        case "launched":
          return ok({ kind: "launched", runId: sunoRunId({ id: r.value.jobId }), jobId: sunoKernelId({ id: r.value.jobId }) });
        case "stale":
          return ok({ kind: "stale", fresh: wrap(r.value.jobId, out.fresh) });
        case "receipt":
          return err("internal", "a Suno confirm answered a receipt");
      }
    });
  },
};

/* ── image: a forge sweep, planned from the chosen style(s) over the stock scenes ── */
//
// L45: the Floor sweep is the forge's own launch (lib/producers/forge.ts `launchFloorForge`): the
// receipt prices the candidates the plan will cross without writing anything, the confirm prepares
// run.json and enqueues the gpu.local job Python's worker claims. The run id travels in the token,
// as strips' does: the receipt names the run its quote is keyed by.

function sweepOf(input: ComposerInput, runId: string): Result<FloorSweep> {
  if (input.lane !== "image") return err("internal", `forge door handed a ${input.lane} input`);
  return ok({ runId, styles: input.sweep === true ? "sweep" : [input.styleId], mechanisms: input.mechanisms });
}

function imageReceipt(c: LaunchContext, input: ComposerInput, o: Opts): Result<Receipt> {
  const runId = `floor-${slug(input.lane === "image" && input.sweep !== true ? input.styleId : "sweep", 40)}-${c.mint()}`;
  const sweep = sweepOf(input, runId);
  if (!sweep.ok) return sweep;
  const r = launchFloorForge(c.store, sweep.value, { mode: o.mode, ...ceilingOf(o), actor: { kind: "operator", id: "receipt" }, dryOnly: c.dryOnly, now: c.now });
  if (!r.ok) return r;
  return r.value.kind === "receipt" ? ok(wrap(runId, r.value.receipt)) : err("internal", `a forge receipt read answered ${r.value.kind}`);
}

const image: LaneDoor = {
  receipt: imageReceipt,
  launch(c, input, token, o, actor) {
    const t = unwrap(token);
    if (t === undefined) {
      const fresh = imageReceipt(c, input, o);
      return fresh.ok ? ok({ kind: "stale", fresh: fresh.value }) : fresh;
    }
    const sweep = sweepOf(input, t.runId);
    if (!sweep.ok) return sweep;
    const r = launchFloorForge(c.store, sweep.value, { mode: o.mode, ...ceilingOf(o), actor, token: t.inner, dryOnly: c.dryOnly, now: c.now });
    if (!r.ok) return r;
    const out = r.value;
    switch (out.kind) {
      case "launched":
      case "retried":
        return ok({ kind: "launched", runId: forgeRunOf(out.runId), jobId: out.jobId });
      case "stale":
        return ok({ kind: "stale", fresh: wrap(t.runId, out.fresh) });
      case "existing":
        return err("conflict", `forge run ${out.runId} is served by job ${out.jobId} (${out.state}); one job serves a run at a time`);
      case "receipt":
        return err("internal", "a forge confirm answered a receipt");
    }
  },
};

export const LANE_DOORS: Readonly<Record<ComposerInput["lane"], LaneDoor>> = { article, video, audio, image };
