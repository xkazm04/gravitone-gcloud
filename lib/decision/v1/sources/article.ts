import "server-only";

import type { BlobRef } from "@gt/domain/blob";
import type { EditPlan } from "@gt/domain/board";
import { err, ok, type Result } from "@gt/domain/errors";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import type { Store } from "@gt/kernel/store";
import { decodeSchedule, scheduleWords } from "@gt/ui/components/review/schedule.ts";
import type { ItemWords, ReviewCheck, ReviewDoc, ReviewSection, Reviewer, RowWords } from "@gt/ui/board/port";

import { approveRun, rejectRun } from "../../../articles/humanActs.ts";
import { reworkRun } from "../../../articles/rework.ts";
import { getRunDetail } from "../../../articles/runReads.ts";
import { defaultDeps, type EngineDeps } from "../../../articles/engine.ts";
import { inRun, readRun, readTextFile, slugify } from "../../../articles/store.ts";
import { continueArticle } from "../../../producers/article.ts";
import { NOTE_MAX_CHARS, type ArticleRun, type ArticleRunDetail, type ArticleStatus } from "../../../articles/types.ts";
import { kernel } from "../../../kernelStore.ts";
import { encodeNote } from "../note.ts";
import { blogScheduleOf, ensureBlogSlot, landBlogSlot } from "./articleSlot.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import {
  buildConsequence,
  decisionMap,
  mediaRefs,
  mintPacket,
  runIdOf,
  v1Call,
  v1DigestOf,
  type AdapterRef,
  type ConsequenceParts,
  type DecisionAdapter,
  type DecisionsAt,
  type Loss,
  type OpenPlan,
  type Preview,
} from "../types.ts";

// AN ARTICLE AT THE GATE AS A PACKET - one run of the article engine
// (<store>/<runId>/, lib/articles/store.ts) at `awaiting-approval`, decided as a
// packet review, and handed back through v1's own acts: approveRun then the
// landing job (lib/producers/article.ts continueArticle, exactly the approve
// route), rejectRun, or - on a return - reworkRun with the edit plan rendered as
// v1's one note, then the rework's job.
//
// THE ITEMS ARE THE POST AND ITS REGISTRY PATCHES. v1's Board refused to approve
// a run that proposed patches ("approve per patch on the run's page"), because
// it had one key and approving the post alone declined patches nobody looked
// at. Here each patch is a candidate of its own, and the kernel refuses a
// commit while any is undecided (Phase 3 decision 5) - so the Board can do what
// v1's could not, and nothing is declined unseen. A kept post lands with exactly
// the kept patches (approveRun's `patches`); a rejected post lands nothing.
//
// APPROVE IS OUTWARD-FACING: the landing pushes a branch to ai-registry and opens
// a pull request. The preview says so in those words (Consequence.outward)
// before the commit, which v1's confirm said only as "pushes a branch and opens
// a pull request". The landing is ENQUEUED, as the route does: the apply's success
// is v1 HOLDING the approval with its landing job recorded (Phase 4: approve starts
// a second job, `job:run:<id>:landing`, which the worker drives); a landing that
// fails is that job's failure and the run's own `failed` status with its log.
//
// IDEMPOTENT ON v1's RECORD (hitl-approval resume-after-decision): a redelivered
// apply that finds its own outcome already on run.json - the same approval and
// patch set, the same rejection note, a rework with the same note at or after
// the return - succeeds, and enqueues the act's job again only while the run
// still waits on it (approved, or reworking): the job id is the act's, so a job
// that exists is found, not doubled. v1 holding ANOTHER outcome is refused,
// never overwritten.
//
// APPROVE -> CALENDAR (Phase 6, owner ruling 4): a kept post also puts the run's blog slot on the
// kernel calendar, in the same apply and BEFORE v1's approve (./articleSlot.ts says why the order);
// the preview names the slot with the schedule the operator set on the desk. A redelivery after the
// landing publishes that slot with the pull request, so the calendar ends in "went out", not
// "approved".

const POST = "post";
const PATCH = "patch/";
const patchCandidate = (id: string): string => `${PATCH}${id}`;

export type ArticleV1 = {
  readonly runId: string;
  readonly detail: ArticleRunDetail;
  /** post/post.md, the source the sections are cut from. */
  readonly postMd: string | undefined;
  /** post/index.html, and each patch's diff file, by candidate id. */
  readonly media: ReadonlyMap<string, BlobRef>;
};

export type ArticleAdapterDeps = {
  /** The engine's dependencies for the human acts (the probes inject a clock and a stub agent). */
  readonly engine?: () => EngineDeps;
  /** What starts the act's job after an approve or a rework: lib/producers/article.ts `continueArticle`,
   *  idempotent by job id (the probes inject an in-process drive). */
  readonly launch?: (runId: string) => void | Promise<Result<unknown>>;
  /** The kernel the blog slot is written to; the process's (lib/kernelStore.ts) when absent. */
  readonly store?: () => Result<Store>;
};

/* ── read ──────────────────────────────────────────────────────────────────── */

async function read(ref: AdapterRef): Promise<Result<ArticleV1>> {
  const id = ref.runId;
  const detail = await v1Call(() => getRunDetail(id));
  if (!detail.ok) return detail;
  const postMd = await v1Call(() => readTextFile(inRun(id, "post/post.md")));
  if (!postMd.ok) return postMd;
  const files = await v1Call(async () => [
    { key: POST, abs: inRun(id, "post/index.html") },
    ...detail.value.patches.map((p) => ({ key: patchCandidate(p.id), abs: inRun(id, p.patchFile) })),
  ]);
  if (!files.ok) return files;
  const media = await mediaRefs(files.value);
  if (!media.ok) return media;
  return ok({ runId: id, detail: detail.value, postMd: postMd.value, media: media.value });
}

/* ── packet ────────────────────────────────────────────────────────────────── */

/** post.md cut at its `## ` headings (the cut lib/articles/checksProse.ts reads
 *  the closing section by). A section's id is its heading, so the rework note
 *  rendered from an edit plan names sections the way the writer reads them. */
export function sectionsOf(md: string): ReviewSection[] {
  const parts = md.split(/^## /m);
  const seen = new Map<string, number>();
  const named = (h: string): string => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  };
  const out: ReviewSection[] = [];
  const opening = (parts[0] ?? "").replace(/^# [^\n]*\n?/, "").trim();
  if (opening !== "") out.push({ id: named("Opening"), heading: "Opening", text: opening });
  for (const p of parts.slice(1)) {
    const nl = p.indexOf("\n");
    const heading = (nl < 0 ? p : p.slice(0, nl)).trim();
    if (heading === "") continue;
    out.push({ id: named(heading), heading, text: nl < 0 ? "" : p.slice(nl + 1).trim() });
  }
  return out;
}

/** v1's machine pick, in its words (lib/board/sources/articles.ts articleEntry). */
function checkSummary(d: ArticleRunDetail): { fails: number; summary: string } | undefined {
  if (d.check === undefined) return undefined;
  const items = d.check.items;
  const fails = items.filter((i) => i.status === "fail").length;
  const unmeasured = items.filter((i) => i.status === "not-measured").length + d.check.notMeasured.length;
  return { fails, summary: `check: ${fails} fail · ${unmeasured} not measured · ${items.filter((i) => i.status === "pass").length} pass` };
}

function reviewOf(v1: ArticleV1): ReviewDoc {
  const { run, meta, check, critique } = v1.detail;
  const checks: ReviewCheck[] = (check?.items ?? []).map((i) => ({ name: i.label, value: i.status === "not-measured" ? "not measured" : String(i.value ?? i.status), ok: i.status !== "fail" }));
  const last = [...(critique?.rounds ?? [])].reverse().find((r) => r.reviews.length > 0);
  const reviewers: Reviewer[] = (last?.reviews ?? []).map((r) => ({ who: r.reviewer, vote: r.verdict === "publish" ? "approve" : "request", note: r.summary }));
  return {
    title: meta?.title ?? run.topic.text,
    standfirst: meta?.subtitle ?? run.topic.angle ?? "",
    sections: v1.postMd === undefined ? [] : sectionsOf(v1.postMd),
    checks,
    reviewers,
    turn: (run.rework?.count ?? 0) + 1,
  };
}

const fileUrl = (id: string, rel: string): string => `/api/articles/${encodeURIComponent(id)}/file/${rel.split("/").map(encodeURIComponent).join("/")}`;

function packet(v1: ArticleV1): Result<OpenPlan> {
  const { run, meta, patches } = v1.detail;
  if (run.status !== "awaiting-approval") return err("refused", `only a run awaiting approval is decided; ${run.id} is ${run.status}`);
  const postRef = v1.media.get(POST);
  if (postRef === undefined) return err("not-found", `run ${run.id} has no post/index.html to review`);
  const losses: Loss[] = [];
  // Only patches the human chooses are items: a trial run's required record (t1) lands with the
  // post whatever the approval names, so it is never a decision of this packet.
  const judged = patches.filter((p) => !p.required).filter((p) => {
    if (v1.media.has(patchCandidate(p.id))) return true;
    losses.push({ candidate: patchCandidate(p.id), grade: "dropped", reason: `${p.patchFile} is not on disk; patch ${p.id} cannot be approved here and lands with nothing` });
    return false;
  });
  const title = meta?.title ?? run.topic.text;
  const minted = mintPacket({
    id: packetIdOf("article", run.id),
    lane: "article",
    source: "article",
    mode: "packet-review",
    state: "open",
    runId: run.id,
    title,
    items: [
      { id: POST, jobId: run.id, media: postRef, row: "post", grades: [] },
      ...judged.map((p) => ({ id: patchCandidate(p.id), jobId: run.id, media: v1.media.get(patchCandidate(p.id)), row: "patches", grades: [] })),
    ],
  });
  if (!minted.ok) return minted;
  const items: Record<string, ItemWords> = { [POST]: { label: title, meta: `${run.model} · ${run.effort}`, ...(meta?.subtitle === undefined ? {} : { prompt: meta.subtitle }) } };
  for (const p of judged) items[patchCandidate(p.id)] = { label: `${p.kind} · ${p.target}`, meta: `patch ${p.id}`, prompt: p.rationale };
  const rows: RowWords[] = [{ id: "post", label: "post" }, ...(judged.length > 0 ? [{ id: "patches", label: "registry patches" }] : [])];
  const subject = run.topic.kind === "subject" && run.topic.bundle !== undefined && run.topic.subject !== undefined ? `${run.topic.bundle}/${run.topic.subject}` : "free topic";
  const oracle = checkSummary(v1.detail);
  return ok({
    packet: minted.value,
    // A run at the gate is undecided by construction: v1 has no verdict to import.
    initial: [],
    present: {
      items,
      rows,
      meta: `${subject} · ${run.model}${run.rework === undefined ? "" : ` · rework ${run.rework.count}`}`,
      review: reviewOf(v1),
      ...(oracle === undefined ? {} : { oracle: { passed: oracle.fails === 0, summary: oracle.summary } }),
    },
    urls: Object.fromEntries([[POST, fileUrl(run.id, "post/index.html")], ...judged.map((p) => [patchCandidate(p.id), fileUrl(run.id, p.patchFile)])]),
    losses,
  });
}

/* ── the two notes v1 takes as a string ────────────────────────────────────── */

/** lib/board/sources/articles.ts ARTICLE_NOTE_REFUSAL, v1's words: rejectRun refuses an empty note. */
export const ARTICLE_NOTE_REFUSAL = "a rejection needs a reason or a note";

/** A reject's note as v1's Board wrote it: the reasons line, then the operator's words (encodeNote). */
export function rejectionNote(reasons: readonly string[], note: string | undefined): Result<string> {
  const text = encodeNote(reasons, note ?? null);
  return text === undefined ? err("invalid", ARTICLE_NOTE_REFUSAL) : ok(text);
}

const DIRECTIVE: Readonly<Record<EditPlan[number]["directive"], string>> = {
  more_weight: "give it more weight",
  less_weight: "give it less weight",
  remove: "remove it",
  reposition: "move it",
  free_text: "",
};

/**
 * An edit plan as the ONE note reworkRun takes (Phase 3 decision 8): a line per
 * note, naming its section and directive. reworkRun REFUSES a note over
 * NOTE_MAX_CHARS ("a cut instruction silently changes what the operator asked
 * for"), so the bound is checked here too, where a returning caller can refuse
 * before the kernel records a return v1 would not take.
 */
export function reworkNote(plan: EditPlan): Result<string> {
  if (plan.length === 0) return err("invalid", "a rework needs a note");
  const text = plan.map((n) => `In "${n.section}"${DIRECTIVE[n.directive] === "" ? "" : ` - ${DIRECTIVE[n.directive]}`}: ${n.text.trim()}`).join("\n\n");
  if (text.length > NOTE_MAX_CHARS) return err("invalid", `a rework note is at most ${NOTE_MAX_CHARS} characters; this one is ${text.length}`);
  return ok(text);
}

/* ── consequence ───────────────────────────────────────────────────────────── */

function consequence(v1: ArticleV1, at: DecisionsAt): Result<Preview> {
  const { run, meta, patches } = v1.detail;
  if (run.status !== "awaiting-approval") return err("conflict", `run ${run.id} is ${run.status} now; it was decided on its page`);
  const byPatch = new Map(patches.filter((p) => !p.required && v1.media.has(patchCandidate(p.id))).map((p) => [patchCandidate(p.id), p]));
  const items = [POST, ...byPatch.keys()];
  const decided = decisionMap(at.decisions);
  for (const id of decided.keys()) if (!items.includes(id)) return err("conflict", `${id} is no longer a patch of run ${run.id}`);
  const post = decided.get(POST);
  const kept = [...byPatch].filter(([c]) => decided.get(c)?.verdict === "keep").map(([, p]) => p);
  let parts: ConsequenceParts = {};
  if (post?.verdict === "keep") {
    const title = meta?.title ?? run.topic.text;
    const slug = slugify(title, 60) || slugify(run.topic.text, 60) || run.id;
    const ids = kept.map((p) => p.id);
    const when = decodeSchedule(post.note);
    if (when.kind === "invalid") return err("invalid", when.error);
    if (when.kind === "schedule" && when.schedule.channel !== "blog") return err("invalid", `an article goes out by its pull request on blog, not on ${when.schedule.channel}`);
    parts = {
      writes: [
        { kind: "index-row", target: `calendar · ${when.kind === "schedule" ? scheduleWords(when.schedule) : "blog · the day after the commit, 08:00 UTC"}`, candidate: POST, detail: `slot article:${run.id}, out with the pull request` },
        { kind: "index-row", target: `run.json ${run.id} approval`, candidate: POST, detail: ids.length === 0 ? "the post alone" : `the post and patch ${ids.join(", ")}` },
        { kind: "file", target: `ai-registry publications/${slug}/`, candidate: POST, detail: "post.html, SOURCES.md, publication.json, medium/" },
        ...kept.map((p) => ({ kind: "file" as const, target: `ai-registry ${p.target}`, candidate: patchCandidate(p.id), detail: `${p.kind} patch: ${p.rationale}` })),
      ],
      // lib/articles/registryWrite.ts landRun's two acts that leave this machine.
      outward: [
        { kind: "push", sentence: `push branch article/${slug} to ai-registry's origin (a free name if that one is taken)` },
        { kind: "pull-request", sentence: `open a pull request in ai-registry: publications(${slug}): ${title}` },
      ],
    };
  } else if (post?.verdict === "reject") {
    const note = rejectionNote(post.reasons, post.note);
    if (!note.ok) return note;
    const lost = kept.length === 0 ? "" : `; kept patch ${kept.map((p) => p.id).join(", ")} lands with nothing`;
    parts = { writes: [{ kind: "index-row", target: `run.json ${run.id} rejection`, candidate: POST, detail: `${note.value.slice(0, NOTE_MAX_CHARS)}${lost}` }] };
  }
  const v1Digest = v1DigestOf({
    source: "article",
    run: { id: run.id, status: run.status, approval: run.approval ?? null, rejection: run.rejection ?? null, rework: run.rework ?? null },
    media: [...v1.media].map(([k, b]) => [k, b.sha256]).sort(),
  });
  return ok({ consequence: buildConsequence(at, items, parts, v1Digest), v1Digest });
}

/* ── apply ─────────────────────────────────────────────────────────────────── */

const refused = (sentence: string): Result<never> => err("refused", sentence);
/** The Board's commit is the operator's confirm: it arms the act's job live (decision 4). */
const OPERATOR_ACT = { kind: "operator", id: "board" } as const;
const REWORKING: readonly ArticleStatus[] = ["drafting", "critiquing", "checking"];
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

export function makeArticleAdapter(deps: ArticleAdapterDeps = {}): DecisionAdapter<ArticleV1> {
  const engine = deps.engine ?? (() => defaultDeps());
  const storeOf = deps.store ?? processStore;
  const enqueue = async (id: string): Promise<Result<unknown>> => {
    const run = await v1Call(() => readRun(id));
    return run.ok ? continueArticle(run.value, { actor: OPERATOR_ACT, mode: "live" }) : run;
  };
  const launchOf = deps.launch ?? enqueue;
  const launch = async (id: string): Promise<Result<void>> => {
    const r = await launchOf(id);
    return r === undefined || r.ok ? ok(undefined) : r;
  };

  /** A crash between v1's act and the enqueue leaves the run waiting on a job: enqueue it (idempotent by id). */
  async function relaunch(run: ArticleRun, waiting: readonly ArticleStatus[]): Promise<Result<void>> {
    if (!waiting.includes(run.status)) return ok(undefined);
    return launch(run.id);
  }

  async function applyReturn(id: string, plan: EditPlan, at: string): Promise<Result<void>> {
    const note = reworkNote(plan);
    if (!note.ok) return note;
    const run = await v1Call(() => readRun(id));
    if (!run.ok) return run;
    const rw = run.value.rework;
    if (rw !== undefined && rw.note === note.value && Date.parse(rw.at) >= Date.parse(at)) return relaunch(run.value, REWORKING);
    const r = await v1Call(() => reworkRun(id, note.value, engine()));
    if (!r.ok) return r;
    return launch(id);
  }

  /** The blog slot a kept post puts on the calendar (./articleSlot.ts), from the run's own words. */
  async function slotFor(run: ArticleRun, note: string | undefined, claim: ApplyClaim): Promise<Result<void>> {
    if (claim.outcome.act !== "commit") return ok(undefined);
    const schedule = blogScheduleOf(note, claim.outcome.result.at);
    if (!schedule.ok) return schedule;
    const store = storeOf();
    if (!store.ok) return store;
    const detail = await v1Call(() => getRunDetail(run.id));
    const title = (detail.ok ? detail.value.meta?.title : undefined) ?? run.topic.text;
    const subject = run.topic.kind === "subject" && run.topic.bundle !== undefined && run.topic.subject !== undefined ? `${run.topic.bundle}/${run.topic.subject}` : "free topic";
    const made = ensureBlogSlot(store.value, { runId: run.id, title, description: `ai-registry PR · ${subject}`, tags: run.topic.kind === "subject" && run.topic.bundle !== undefined ? [run.topic.bundle] : [], schedule: schedule.value }, { kind: "machine", id: claim.holder });
    return made.ok ? ok(undefined) : made;
  }

  /** A redelivery that finds the run landed publishes its slot with the pull request. */
  async function landed(id: string, claim: ApplyClaim): Promise<Result<void>> {
    const run = await v1Call(() => readRun(id));
    if (!run.ok) return run;
    const store = storeOf();
    if (!store.ok) return store;
    const r = landBlogSlot(store.value, run.value, { kind: "machine", id: claim.holder }, Date.now());
    return r.ok ? ok(undefined) : r;
  }

  async function apply(claim: ApplyClaim): Promise<Result<void>> {
    const id = runIdOf(claim);
    if (!id.ok) return id;
    if (claim.outcome.act === "return") return applyReturn(id.value, claim.outcome.result.plan, claim.outcome.result.at);
    const decided = decisionMap(claim.decisions);
    const post = decided.get(POST);
    const run = await v1Call(() => readRun(id.value));
    if (!run.ok) return run;
    const { approval, rejection, status } = run.value;
    if (post?.verdict === "keep") {
      const patches = [...decided].filter(([c, d]) => c.startsWith(PATCH) && d.verdict === "keep").map(([c]) => c.slice(PATCH.length));
      // approveRun records a trial run's required patch beside the chosen ones; it is not this packet's to name.
      const required = await v1Call(async () => (approval === undefined ? [] : (await getRunDetail(id.value)).patches.filter((p) => p.required).map((p) => p.id)));
      if (!required.ok) return required;
      if (approval !== undefined && !sameSet(approval.patches.filter((p) => !required.value.includes(p)), patches)) return refused(`run ${id.value} was approved on its page with patches [${approval.patches.join(", ")}]; this packet approves [${patches.join(", ")}]`);
      if (rejection !== undefined) return refused(`run ${id.value} was rejected on its page; this packet approves it`);
      const slot = await slotFor(run.value, post.note, claim);
      if (!slot.ok) return slot;
      if (approval !== undefined) {
        const again = await relaunch(run.value, ["approved"]);
        return again.ok ? landed(id.value, claim) : again;
      }
      const r = await v1Call(() => approveRun(id.value, patches, engine()));
      if (!r.ok) return r;
      return launch(id.value);
    }
    if (post?.verdict === "reject") {
      const note = rejectionNote(post.reasons, post.note);
      if (!note.ok) return note;
      if (rejection !== undefined) return rejection.note === note.value.trim().slice(0, NOTE_MAX_CHARS) ? ok(undefined) : refused(`run ${id.value} was rejected on its page with another note`);
      if (approval !== undefined) return refused(`run ${id.value} was approved on its page (${status}); this packet rejects it`);
      const r = await v1Call(() => rejectRun(id.value, note.value, engine()));
      return r.ok ? ok(undefined) : r;
    }
    return err("invalid", `packet ${claim.packetId} was committed with the post undecided`);
  }

  return { source: "article", read, packet, consequence, apply };
}

export const articleAdapter: DecisionAdapter<ArticleV1> = makeArticleAdapter();
