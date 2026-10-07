// ARTICLES — a drafted post at the human gate, one item per run.
//
// Read through the /api/articles routes (app/articles/articlesClient.ts, the
// same seam /articles uses): GET /api/articles for the list, GET
// /api/articles/<id> for each run still at the gate (its check, its patches,
// its screenshot). A run that has not reached the gate is not an item; one the
// human decided stays an item with its verdict, read off its status
// (lib/board/verdicts.ts fromArticle).
//
// WHAT THE BOARD CANNOT DECIDE, IT REFUSES BY NAME:
//   · approve, when the run proposes registry patches. Approval is per post AND
//     per patch, and the Board has one key; approving the post alone would
//     decline patches nobody looked at. Those runs are approved on their page.
//   · reject with neither a reason nor a note. The engine requires a note;
//     reasons ride in it the way the cull's do (encodeNote).
//   · clear, always. Approval pushes a branch and opens a PR; rejection is
//     terminal. Neither has an inverse to undo into.
//
// Approve from here is the real act: POST /approve, which starts the landing.
//
// THE PIPELINE HALF (spark masterpiece-pipeline-canvas, WP2) sits beside the
// verdict half and shares nothing with it but the run list. A run is drawn by
// its STATUS, not by whether it reached the gate:
//
//   topic (GET /api/articles/topics) ......... proposed
//   queued · researching ..................... working / research
//   drafting ................................. working / draft
//   critiquing ............................... working / critique
//   checking ................................. working / check
//   awaiting-approval ........................ gate
//   approved · landing · landed .............. done      (landed leaves after 7 days)
//   rejected ................................. done      (leaves after 7 days)
//   failed ................................... where it failed, wearing the error
//
// Four statuses have no column of their own and are drawn on the nearest card
// rather than dropped: an item the canvas does not draw is an item the operator
// cannot rescue. `queued` waits at the door of research; `approved` and
// `landing` are the human's act already done and sit in `done` until the PR is
// open; `rejected` is terminal and stays in `done` for the same seven days a
// landed post does, then leaves on its own; `failed` sits at the step that
// failed (read off its own step records) and wears its error. A failed run is
// not resumed by dragging it: the engine picks the step, not the hand.
//
// THE TRANSITION TABLE IS READ, NOT RESTATED. `admits()` asks `canTransition`
// (lib/articles/types.ts) about the edge a drop would make, so a refusal is the
// store's own sentence and a second copy of the table cannot exist. The table
// only says which edges are LEGAL. Who may take one is the engine's: of the legal
// edges out of the gate, two are the human's (approve, rework); every other legal
// edge is a machine's step and is refused as that, not as a table violation.

import {
  approveRun,
  createRun,
  getRun,
  listRuns,
  listTopics,
  rejectRun,
  reworkRun,
  runFileUrl,
  type Fetched,
  type RunDetail,
  type TopicChoice,
} from "@/app/articles/articlesClient";
import { ARTICLE_STATUSES, CHECK_DIMENSIONS, RUN_COST_HINT, canTransition, type ArticleRun, type ArticleStatus } from "@/lib/articles/types";

import type { CanonStage, GroupAxis, LaneDef, MoveOffer, MoveRequest, MoveResult, PipelineEntry, PipelineItem, PipelineLoadNotes, PipelineSource, StageBand } from "../pipeline";
import { lanesFromItems, makeVersionStamp, stubbedMove, UNGROUPED_LANE } from "../pipeline";
import type { BoardEntry, BoardSourceExt } from "../source";
import { itemId, itemsOf, keyOfItem, SourceUnavailable, VerdictRefused } from "../source";
import type { BoardMedia, BoardVerdict } from "../types";
import { encodeNote, fromArticle } from "../verdicts";

export const ARTICLE_CLEAR_REFUSAL = "an article verdict is final: approval opens a registry PR, rejection ends the run";
export const ARTICLE_DECIDED_REFUSAL = "this run is already decided";
export const articlePatchRefusal = (n: number) => `${n} registry patch${n === 1 ? "" : "es"} — approve per patch on the run's page`;
export const ARTICLE_NOTE_REFUSAL = "a rejection needs a reason or a note";

function must<T>(r: Fetched<T>): T {
  if (r.ok) return r.data;
  if (r.kind === "unavailable") throw new SourceUnavailable("/api/articles is not built here");
  if (r.status === 0 || r.status === 401 || r.status === 403) throw new SourceUnavailable(r.error);
  throw new Error(r.error);
}

const usd = (run: ArticleRun): string | null => {
  const priced = run.steps.filter((s) => s.costUsd !== undefined);
  return priced.length ? `$${priced.reduce((a, s) => a + (s.costUsd ?? 0), 0).toFixed(2)}` : null;
};

/** One run as a Board entry. `detail` is present for a run at the gate. */
export function articleEntry(run: ArticleRun, detail: RunDetail | null): BoardEntry | null {
  const verdict = fromArticle(run);
  if (verdict === undefined) return null;
  const media: BoardMedia[] = [];
  const shot = detail?.check?.screenshots.find((s) => /1440\.png$/.test(s)) ?? detail?.check?.screenshots[0];
  if (shot) media.push({ kind: "image", src: runFileUrl(run.id, shot) });
  const words = detail?.meta?.subtitle || run.rejection?.note || run.topic.angle || run.topic.text;
  media.push({ kind: "text", text: words });

  const items = detail?.check?.items ?? [];
  const fails = items.filter((i) => i.status === "fail").length;
  // storytelling and depth are never measured by code; they are listed, not itemised
  const unmeasured = items.filter((i) => i.status === "not-measured").length + (detail?.check?.notMeasured.length ?? 0);
  const patches = detail?.patches.length ?? 0;
  const cost = usd(run);

  return {
    item: {
      id: itemId("articles", run.id),
      source: "articles",
      title: detail?.meta?.title ?? run.topic.text,
      projectId: null,
      group: run.topic.kind === "subject" && run.topic.bundle ? run.topic.bundle : null,
      media,
      machinePick: detail?.check ? `check: ${fails} fail · ${unmeasured} not measured · ${items.filter((i) => i.status === "pass").length} pass` : null,
      verdict,
      reasons: [],
      note: run.rejection?.note ?? null,
      createdAt: run.createdAt,
    },
    href: `/articles/${encodeURIComponent(run.id)}`,
    facts: [
      { name: "status", value: run.status },
      { name: "model", value: run.model },
      ...(run.topic.kind === "subject" && run.topic.bundle && run.topic.subject ? [{ name: "subject", value: `${run.topic.bundle}/${run.topic.subject}` }] : []),
      ...(detail ? [{ name: "sources", value: String(detail.sources.length) }, { name: "patches", value: String(patches) }] : []),
      ...(cost ? [{ name: "cost", value: cost }] : []),
    ],
    refuse: {
      clear: ARTICLE_CLEAR_REFUSAL,
      ...(verdict !== null ? { approve: ARTICLE_DECIDED_REFUSAL, reject: ARTICLE_DECIDED_REFUSAL } : patches > 0 ? { approve: articlePatchRefusal(patches) } : {}),
    },
  };
}

/* ── the pipeline half ─────────────────────────────────────────────────────── */

/** A landed or rejected post stays in `done` this long, then leaves on its own. */
export const DONE_WINDOW_DAYS = 7;
/** How many uncovered topics the first column asks for. The rest are counted, not drawn. */
export const TOPIC_LIMIT = 20;
const DAY_MS = 86_400_000;

export const ARTICLE_LANE_REFUSAL = "an article's row is its bundle, read off the topic; it is not written anywhere";
export const articleMachineRefusal = (from: ArticleStatus, to: ArticleStatus) => `the engine moves a run from ${from} to ${to}; nobody is waiting on you`;
export const articleFailedRefusal = (stepName: string) => `failed at ${stepName}: resume it on its page, where the engine picks the step`;
/** The store's own sentence for an edge its table forbids (lib/articles/store.ts assertTransition). */
export const articleTransitionRefusal = (from: ArticleStatus, to: ArticleStatus) => `a run that is ${from} cannot become ${to}`;

// `PipelineLoadNotes`, `stubbedMove` and `isStubbedMove` were written here
// first and are now in ../pipeline, where the engine and the audio adapter can
// see them too. Re-exported because the probe spec reaches them through this
// module, and because a reader of this file should not have to know they moved.
export { isStubbedMove, stubbedMove, type PipelineLoadNotes } from "../pipeline";

export type ArticlesPipelineSource = BoardSourceExt & PipelineSource & { lastLoad(): PipelineLoadNotes };

const WORKING_BANDS: StageBand[] = [
  { id: "research", label: "rsrch" },
  { id: "draft", label: "draft" },
  { id: "critique", label: "crit" },
  { id: "check", label: "ck" },
];
const BAND_STATUS: Record<string, ArticleStatus> = { research: "researching", draft: "drafting", critique: "critiquing", check: "checking" };
const STATUS_BAND: Partial<Record<ArticleStatus, string>> = {
  queued: "research",
  researching: "research",
  drafting: "draft",
  critiquing: "critique",
  checking: "check",
};

type Site = { stage: CanonStage; band: string | null };

/** Where a failed run failed, read off its own step records: the step that is
 *  marked failed, else the last one that started, else the door of research.
 *  A run that was approved failed in the landing. */
function siteOfFailure(run: ArticleRun): { site: Site; step: string } {
  if (run.approval) return { site: { stage: "done", band: null }, step: "landing" };
  const failed = [...run.steps].reverse().find((s) => s.status === "failed") ?? run.steps[run.steps.length - 1];
  if (!failed) return { site: { stage: "working", band: "research" }, step: "queue" };
  const band = failed.name === "outline" || failed.name === "draft" ? "draft" : failed.name;
  return { site: { stage: "working", band }, step: failed.name };
}

/** `landedAt` is the event time of a landing (lib/articles/types.ts); a run that
 *  landed before the field existed has none, and its age is not guessed at. */
const landedAtOf = (run: ArticleRun): string | undefined => (run as ArticleRun & { landedAt?: string }).landedAt;

type Placed = { site: Site } | { hidden: string };

function siteOf(run: ArticleRun, now: number): Placed {
  const within = (iso: string | undefined, what: string): Placed => {
    const at = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(at)) return { hidden: `${what}, no recorded date` };
    return now - at > DONE_WINDOW_DAYS * DAY_MS ? { hidden: `${what} more than ${DONE_WINDOW_DAYS} days ago` } : { site: { stage: "done", band: null } };
  };
  switch (run.status) {
    case "queued":
    case "researching":
    case "drafting":
    case "critiquing":
    case "checking":
      return { site: { stage: "working", band: STATUS_BAND[run.status]! } };
    case "awaiting-approval":
      return { site: { stage: "gate", band: null } };
    case "approved":
    case "landing":
      return { site: { stage: "done", band: null } };
    case "landed":
      return within(landedAtOf(run), "landed");
    case "rejected":
      return within(run.rejection?.at, "rejected");
    case "failed":
      return { site: siteOfFailure(run).site };
  }
}

const bundleLane = (run: ArticleRun): string => (run.topic.kind === "subject" && run.topic.bundle ? run.topic.bundle : UNGROUPED_LANE);

type RunNative = { kind: "run"; run: ArticleRun; detail: RunDetail | null; item: PipelineItem };
type TopicNative = { kind: "topic"; topic: TopicChoice; item: PipelineItem };
type Native = RunNative | TopicNative;

const EPOCH = new Date(0).toISOString();

/** The status a drop on (stage, band) asks for, for a run in `from`. The one
 *  place the canon's geometry is turned into the engine's vocabulary. A drop on
 *  `done` from the gate is the approval, whose first status is `approved`. */
function targetStatus(from: ArticleStatus, to: CanonStage, band: string | null): ArticleStatus | null {
  switch (to) {
    case "gate":
      return "awaiting-approval";
    case "done":
      return from === "awaiting-approval" ? "approved" : "landed";
    case "working":
      return band !== null ? (BAND_STATUS[band] ?? null) : null;
    case "proposed":
      return null;
  }
}

const topicAddress = (t: TopicChoice) => `${t.bundle}/${t.slug}`;

/** A read of a route other than /api/articles, with its own name in the unavailable sentence. */
function mustAt<T>(r: Fetched<T>, path: string): T {
  if (r.ok) return r.data;
  if (r.kind === "unavailable") throw new SourceUnavailable(`${path} is not built here`);
  if (r.status === 0 || r.status === 401 || r.status === 403) throw new SourceUnavailable(r.error);
  throw new Error(r.error);
}

export function makeArticlesSource(opts: { now?: () => number } = {}): ArticlesPipelineSource {
  const now = opts.now ?? Date.now;
  const loadEntries = async (): Promise<BoardEntry[]> => {
    const { runs } = must(await listRuns());
    const atGate = runs.filter((r) => fromArticle(r) !== undefined);
    const details = await Promise.all(atGate.map(async (r) => (r.status === "awaiting-approval" ? must(await getRun(r.id)) : null)));
    return atGate.map((r, i) => articleEntry(r, details[i])).filter((e): e is BoardEntry => e !== null);
  };

  /* ── pipeline state ─────────────────────────────────────────────────────── */

  const natives = new Map<string, Native>();
  // `version` is bumped when the native record's signature changes, so a card
  // re-renders for its own data and never for a sibling's.
  const versions = new Map<string, { sig: string; v: number }>();
  const stamp = makeVersionStamp();
  let notes: PipelineLoadNotes = { hidden: [], damaged: [] };

  const runItem = (run: ArticleRun, detail: RunDetail | null, site: Site): PipelineItem => {
    const shot = detail?.check?.screenshots.find((x) => /1440\.png$/.test(x)) ?? detail?.check?.screenshots[0];
    const words = detail?.meta?.subtitle || run.rejection?.note || run.topic.angle || run.topic.text;
    const media: BoardMedia[] = [...(shot ? [{ kind: "image" as const, src: runFileUrl(run.id, shot) }] : []), { kind: "text", text: words }];
    const items = detail?.check?.items ?? [];
    const fails = items.filter((i) => i.status === "fail").length;
    const unmeasured = items.filter((i) => i.status === "not-measured").length + (detail?.check?.notMeasured.length ?? 0);
    const lane = bundleLane(run);
    const id = itemId("articles", run.id);
    return {
      id,
      source: "articles",
      title: detail?.meta?.title ?? run.topic.text,
      projectId: null,
      group: lane === UNGROUPED_LANE ? null : lane,
      media,
      machinePick: detail?.check ? `check: ${fails} fail · ${unmeasured} not measured · ${items.filter((i) => i.status === "pass").length} pass` : null,
      verdict: fromArticle(run) ?? null,
      reasons: [],
      // A failed run wears the engine's own words; a rejected one, the human's.
      note: run.status === "failed" ? (run.error ?? null) : (run.rejection?.note ?? null),
      createdAt: run.createdAt,
      lane,
      placement: { stage: site.stage, band: site.band, lane },
      version: stamp(id, `${run.status}|${run.updatedAt}|${detail ? "d" : ""}`),
    };
  };

  const topicItem = (t: TopicChoice): PipelineItem => {
    const id = itemId("articles", `topic:${topicAddress(t)}`);
    return {
      id,
      source: "articles",
      title: t.title,
      projectId: null,
      group: t.bundle,
      media: [{ kind: "text", text: t.angle }],
      machinePick: null,
      verdict: null,
      reasons: [],
      note: null,
      createdAt: EPOCH,
      lane: t.bundle,
      placement: { stage: "proposed", band: null, lane: t.bundle },
      version: stamp(id, `${t.title}|${t.angle}`),
    };
  };

  const runFacts = (run: ArticleRun, detail: RunDetail | null): { name: string; value: string }[] => {
    const cost = usd(run);
    const landed = landedAtOf(run);
    return [
      { name: "status", value: run.status },
      ...(run.status === "failed" ? [{ name: "failed at", value: siteOfFailure(run).step }] : []),
      { name: "model", value: run.model },
      { name: "effort", value: run.effort },
      ...(run.topic.kind === "subject" && run.topic.bundle && run.topic.subject ? [{ name: "subject", value: `${run.topic.bundle}/${run.topic.subject}` }] : []),
      ...(run.rework ? [{ name: "reworked", value: `${run.rework.count}×` }] : []),
      ...(detail ? [{ name: "sources", value: String(detail.sources.length) }, { name: "patches", value: String(detail.patches.length) }] : []),
      ...(cost ? [{ name: "cost", value: cost }] : []),
      ...(landed ? [{ name: "landed", value: landed.slice(0, 10) }] : []),
    ];
  };

  const entryOf = (n: Native): PipelineEntry => {
    if (n.kind === "topic") {
      const t = n.topic;
      const none = "a topic has not been written yet";
      return {
        item: n.item,
        placement: n.item.placement,
        href: "/articles/new",
        facts: [
          { name: "subject", value: topicAddress(t) },
          { name: "category", value: t.category },
        ],
        refuse: { approve: none, reject: none, clear: none },
      };
    }
    const verdict = fromArticle(n.run);
    const patches = n.detail?.patches.length ?? 0;
    const off = "this run is not at the gate";
    return {
      item: n.item,
      placement: n.item.placement,
      href: `/articles/${encodeURIComponent(n.run.id)}`,
      facts: runFacts(n.run, n.detail),
      refuse: {
        clear: ARTICLE_CLEAR_REFUSAL,
        ...(verdict === undefined
          ? { approve: off, reject: off }
          : verdict !== null
            ? { approve: ARTICLE_DECIDED_REFUSAL, reject: ARTICLE_DECIDED_REFUSAL }
            : patches > 0
              ? { approve: articlePatchRefusal(patches) }
              : {}),
      },
    };
  };

  const runOf = (item: PipelineItem): RunNative | null => {
    const n = natives.get(item.id);
    return n?.kind === "run" ? n : null;
  };
  // A topic has no run yet, so it has no status, model or effort of its own:
  // it sits in the unwritten row rather than in a made-up one.
  const groupAxes: GroupAxis[] = [
    { id: "bundle", label: "bundle", of: (item) => item.lane },
    { id: "status", label: "status", of: (item) => runOf(item)?.run.status ?? UNGROUPED_LANE },
    { id: "model", label: "model", of: (item) => runOf(item)?.run.model ?? UNGROUPED_LANE },
    { id: "effort", label: "effort", of: (item) => runOf(item)?.run.effort ?? UNGROUPED_LANE },
  ];

  const refused = (reason: string): MoveOffer => ({ kind: "refused", reason });

  const admits = (item: PipelineItem, to: CanonStage, band: string | null): MoveOffer => {
    const n = natives.get(item.id);
    if (!n) return refused("this card is not on the board any more");
    const here = n.item.placement;
    const bandIds = WORKING_BANDS.map((b) => b.id);
    if (to === "working" ? band === null || !bandIds.includes(band) : band !== null) {
      return refused(to === "working" ? "working is drawn in four bands; drop on one" : `${to} has no bands`);
    }
    const sameCell = to === here.stage && band === here.band;

    if (n.kind === "topic") {
      if (sameCell) return refused(ARTICLE_LANE_REFUSAL);
      if (to !== "working") return refused("nothing has been written for a topic: there is no draft to gate and no post to land");
      if (band !== "research") return refused("a run starts at research");
      return {
        kind: "needs",
        needs: "confirm",
        prompt: `Write "${n.topic.title}". This starts real agent sessions on your seat.`,
        cost: {
          usdLow: RUN_COST_HINT.usdLow,
          usdHigh: RUN_COST_HINT.usdHigh,
          turnsLow: RUN_COST_HINT.turnsLow,
          turnsHigh: RUN_COST_HINT.turnsHigh,
          note: `observed over the runs of ${RUN_COST_HINT.measured}; it moves with the model and the critique roster`,
        },
      };
    }

    const run = n.run;
    if (sameCell) return refused(ARTICLE_LANE_REFUSAL);
    if (to === "proposed") return refused("a run cannot go back to being a topic");
    const target = targetStatus(run.status, to, band);
    if (target === null) return refused(`no status of a run is drawn at ${to}`);
    if (!canTransition(run.status, target)) return refused(articleTransitionRefusal(run.status, target));

    if (run.status === "awaiting-approval" && target === "approved") {
      const patches = n.detail?.patches.length;
      if (patches === undefined) return refused("this run's registry patches could not be read, so approving would decide them unseen");
      if (patches > 0) return refused(articlePatchRefusal(patches));
      return {
        kind: "needs",
        needs: "confirm",
        prompt: `Approve "${item.title}".`,
        cost: { note: "pushes a branch and opens a pull request in ai-registry; nothing is spent, and it cannot be undone from here" },
      };
    }
    if (run.status === "awaiting-approval" && target === "drafting") {
      return {
        kind: "needs",
        needs: "note",
        prompt: `What should the draft of "${item.title}" change?`,
        cost: {
          note: `re-runs draft, critique and check on the kept research; no figure is measured for a rework, a whole run was $${RUN_COST_HINT.usdLow}–${RUN_COST_HINT.usdHigh} (${RUN_COST_HINT.measured})`,
        },
      };
    }
    if (run.status === "failed") return refused(articleFailedRefusal(siteOfFailure(run).step));
    return refused(articleMachineRefusal(run.status, target));
  };

  const failMove = (reason: string, retryable = false): MoveResult => ({ ok: false, reason, retryable });
  const fromFetched = (r: Extract<Fetched<unknown>, { ok: false }>, what: string): MoveResult =>
    failMove(r.kind === "unavailable" ? `${what} is not built here (${r.error})` : r.error, r.status === 0);

  const place = (run: ArticleRun, detail: RunDetail | null): { native: RunNative } | { hidden: string } => {
    const placed = siteOf(run, now());
    if ("hidden" in placed) return placed;
    return { native: { kind: "run", run, detail, item: runItem(run, detail, placed.site) } };
  };

  const settle = (n: Native): PipelineItem => {
    natives.set(n.item.id, n);
    return n.item;
  };

  const move = async (req: MoveRequest): Promise<MoveResult> => {
    const n = natives.get(req.itemId);
    if (!n) return failMove("this card is not on the board any more");
    const offer = admits(n.item, req.to, req.band);
    if (offer.kind === "refused") return failMove(offer.reason);
    if (offer.kind === "ok") return { ok: true, item: n.item };
    if (offer.needs === "note" && !req.note?.trim()) return failMove("a rework needs a note");

    // Every move that survives to here spends the operator's seat or opens a PR
    // in another repository, so none of them is inferred: an unset `live` takes
    // the dry path, says so, and leaves the card where it was.
    const act =
      n.kind === "topic"
        ? "POST /api/articles"
        : req.to === "done"
          ? `POST /api/articles/${n.run.id}/approve`
          : `POST /api/articles/${n.run.id}/rework`;
    if (req.live !== true) return stubbedMove(n.item, act);

    if (n.kind === "topic") {
      const t = n.topic;
      const r = await createRun({ topic: { kind: "subject", bundle: t.bundle, subject: t.slug, text: "", ...(t.angle ? { angle: t.angle } : {}) } });
      if (!r.ok) return fromFetched(r, "/api/articles");
      natives.delete(n.item.id);
      const placed = place(r.data.run, null);
      if ("hidden" in placed) return failMove(`the run was created but is not drawn: ${placed.hidden}`);
      return { ok: true, item: settle(placed.native) };
    }
    if (req.to === "done") {
      const r = await approveRun(n.run.id, []);
      if (!r.ok) return fromFetched(r, `/api/articles/${n.run.id}/approve`);
      const placed = place(r.data.run, n.detail);
      if ("hidden" in placed) return failMove(`the run was approved but is not drawn: ${placed.hidden}`);
      return { ok: true, item: settle(placed.native) };
    }
    const r = await reworkRun(n.run.id, req.note!.trim());
    if (!r.ok) return fromFetched(r, "the rework route");
    const placed = place(r.data.run, null);
    if ("hidden" in placed) return failMove(`the run was reworked but is not drawn: ${placed.hidden}`);
    return { ok: true, item: settle(placed.native) };
  };

  const loadPipeline = async (): Promise<PipelineEntry[]> => {
    const [runsR, topicsR] = await Promise.all([listRuns(), listTopics({ limit: TOPIC_LIMIT })]);
    const { runs, damaged } = must(runsR);
    // Topics are the first column. A read that failed is not an empty column: it
    // fails the load, so the surface says unavailable or error, never "nothing proposed".
    const topicList = mustAt(topicsR, "/api/articles/topics");

    const hidden = new Map<string, { stage: CanonStage; count: number; why: string }>();
    const gated = runs.filter((r) => r.status === "awaiting-approval");
    // A detail that could not be read leaves the card drawn without it, and
    // `admits` then refuses the approval whose patches it cannot see.
    const details = new Map<string, RunDetail | null>(
      await Promise.all(
        gated.map(async (r): Promise<[string, RunDetail | null]> => {
          const d = await getRun(r.id);
          return [r.id, d.ok ? d.data : null];
        }),
      ),
    );

    const next = new Map<string, Native>();
    for (const t of topicList.topics) {
      const item = topicItem(t);
      next.set(item.id, { kind: "topic", topic: t, item });
    }
    for (const run of runs) {
      const placed = place(run, details.get(run.id) ?? null);
      if ("hidden" in placed) {
        const key = placed.hidden;
        const have = hidden.get(key);
        if (have) have.count++;
        else hidden.set(key, { stage: "done", count: 1, why: key });
        continue;
      }
      next.set(placed.native.item.id, placed.native);
    }
    natives.clear();
    for (const [k, v] of next) natives.set(k, v);

    const more = topicList.remaining - topicList.topics.length;
    notes = {
      hidden: [...(more > 0 ? [{ stage: "proposed" as const, count: more, why: `uncovered topics past the first ${TOPIC_LIMIT}` }] : []), ...hidden.values()],
      damaged,
    };
    return [...natives.values()].map(entryOf);
  };

  return {
    id: "articles",
    label: "Articles",
    // The owner's seven quality dimensions (lib/articles/types.ts): what a
    // rejected post fell short on, in the words its check report uses.
    reasonAxes: [...CHECK_DIMENSIONS],
    native: { href: "/articles", label: "Articles" },
    exclusive: false,
    commitsOn: null,
    async count() {
      const { runs } = must(await listRuns());
      let total = 0;
      let pending = 0;
      let rejected = 0;
      for (const r of runs) {
        const v = fromArticle(r);
        if (v === undefined) continue;
        total++;
        if (v === null) pending++;
        else if (v === "reject") rejected++;
      }
      return { total, pending, decided: total - pending, rejected };
    },
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(id: string, verdict: BoardVerdict, reasons: string[] = [], note?: string) {
      const runId = keyOfItem(id);
      if (verdict === null) throw new VerdictRefused(ARTICLE_CLEAR_REFUSAL);
      // Read fresh: the run may have been decided on its page since the Board loaded.
      const detail = must(await getRun(runId));
      if (fromArticle(detail.run) !== null) throw new VerdictRefused(ARTICLE_DECIDED_REFUSAL);
      if (verdict === "approve") {
        if (detail.patches.length) throw new VerdictRefused(articlePatchRefusal(detail.patches.length));
        must(await approveRun(runId, []));
        return;
      }
      const written = encodeNote(reasons, note ?? null);
      if (!written) throw new VerdictRefused(ARTICLE_NOTE_REFUSAL);
      must(await rejectRun(runId, written));
    },

    stages: ["proposed", "working", "gate", "done"],
    bands: { working: WORKING_BANDS },
    groupAxes,
    lanes(items: readonly PipelineItem[], axis: GroupAxis): LaneDef[] {
      const lanes = lanesFromItems(items, axis);
      if (axis.id !== "status") return lanes;
      // Statuses read in the pipeline's own order, not in the order they were first seen.
      const rank = (k: string) => ARTICLE_STATUSES.indexOf(k as ArticleStatus);
      return [...lanes].sort((a, b) => (a.key === UNGROUPED_LANE ? 1 : b.key === UNGROUPED_LANE ? -1 : rank(a.key) - rank(b.key)));
    },
    placementOf(item) {
      const n = natives.get(item.id);
      if (!n) throw new Error(`articles: ${item.id} was not read by this source; loadPipeline() first`);
      return n.item.placement;
    },
    admits,
    move,
    loadPipeline,
    lastLoad: () => notes,
  };
}
