// LANE — THE TWO PIPELINE ADAPTERS TRANSLATE ONCE (dynamic).
//
// The pipeline canvas draws every media type from one contract
// (lib/board/pipeline.ts). The contract is only as good as the two adapters
// that fill it: if one of them leaks its native shape, every feature downstream
// forks per source. So this probe drives both adapters over a REPLACED `fetch`
// (no server, no vendor, no disk) and asserts, from the outside:
//
//   · Articles: `admits()` READS the store's transition table. For every
//     (status x target) pair, a pair the table forbids is refused in the
//     store's own sentence and a pair it allows is not - so a restated copy of
//     the table that drifted would fail here, not in front of the operator.
//   · The three offers the brief names: the dispatch offer carries
//     RUN_COST_HINT's figures and its date, rework asks for a note, finalize
//     asks for a label.
//   · A source that cannot be read is `unavailable` / `error`, never an empty
//     lane, and a genuinely empty source is `empty`. Those are different states.
//   · Nothing spends without `live === true`: the dry path calls no write route.
//   · Audio: the placement of every stage, the declared row order, and the
//     in-flight request that vanishes on success and returns wearing the
//     vendor's sentence on failure.
//
// Nothing here reaches a real route. A POST that a test lets through goes to the
// replaced fetch, which records it and answers from a fixture.

import { test, expect } from "@playwright/test";

import { canTransition, ARTICLE_STATUSES, RUN_COST_HINT, type ArticleRun, type ArticleStatus } from "@/lib/articles/types";
import { CANON_STAGES, UNGROUPED_LANE, isPipelineSource, type CanonStage, type MoveOffer, type PipelineItem } from "@/lib/board/pipeline";
import { stateOfEntries, stateOfError } from "@/lib/board/registry";
import { articleMachineRefusal, articleTransitionRefusal, DONE_WINDOW_DAYS, isStubbedMove, makeArticlesSource, TOPIC_LIMIT } from "@/lib/board/sources/articles";
import { AUDIO_UNJUDGED_REFUSAL, makeAudioSource } from "@/lib/board/sources/audio";
import type { Hunt, HuntNode, SoundTake } from "@/lib/sound/types";

/* ── a replaced fetch ─────────────────────────────────────────────────────── */

type Reply = Response | "network-down";
type Handler = (url: URL, method: string, body: unknown) => Reply | Promise<Reply>;

const json = (body: unknown, status = 200) => Response.json(body, { status });

function install(handler: Handler) {
  const real = globalThis.fetch;
  const calls: { method: string; path: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://probe.invalid");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });
    const r = await handler(url, method, body);
    if (r === "network-down") throw new TypeError("fetch failed");
    return r;
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = real), writes: () => calls.filter((c) => c.method !== "GET") };
}

/* ── articles fixtures ────────────────────────────────────────────────────── */

const NOW = Date.parse("2026-10-07T12:00:00.000Z");
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

function run(id: string, status: ArticleStatus, extra: Partial<ArticleRun> = {}): ArticleRun {
  return {
    id,
    status,
    topic: { kind: "subject", bundle: "software-engineering", subject: "retry-backoff", text: "Retry and backoff" },
    promptRef: { file: "pipeline/ARTICLE-POST-PROMPT.md", sha: "x" },
    standard: { recipe: "technical-blog-post-authoring", bundle: "technical-writing", subjects: [] },
    model: "claude-opus-x",
    effort: "high",
    steps: [],
    createdAt: iso(10),
    updatedAt: iso(1),
    ...extra,
  };
}

const topic = (slug: string, bundle = "media-generation") => ({ bundle, slug, category: "visual-generation", file: `${bundle}/${slug}.md`, title: slug.replace(/-/g, " "), angle: `angle for ${slug}` });

const ALL_STATUS_RUNS: ArticleRun[] = ARTICLE_STATUSES.map((s) =>
  run(`run-${s}`, s, s === "failed" ? { error: "critique quorum not met", steps: [{ name: "research", status: "done", startedAt: iso(2) }, { name: "critique", status: "failed", startedAt: iso(1) }] } : {}),
);

function articlesApi(runs: ArticleRun[], topics = [topic("frame-direction"), topic("cinematic-language")], remaining = topics.length): Handler {
  return (url, method) => {
    if (url.pathname === "/api/articles" && method === "GET") return json({ runs, damaged: [], driving: [] });
    if (url.pathname === "/api/articles/topics") return json({ topics, covered: [], claimed: [], remaining });
    const m = /^\/api\/articles\/([^/]+)$/.exec(url.pathname);
    if (m) {
      const r = runs.find((x) => x.id === m[1]);
      return r ? json({ run: r, sources: [], claims: [], patches: [], driving: false, agent: {} }) : json({ error: "no such run" }, 404);
    }
    return json({ error: "unrouted in the probe" }, 404);
  };
}

const BANDS_OF_WORKING = ["research", "draft", "critique", "check"];
/** Every target a card can be dropped on, as (stage, band). */
const TARGETS: { label: string; to: CanonStage; band: string | null }[] = [
  { label: "proposed", to: "proposed", band: null },
  ...BANDS_OF_WORKING.map((b) => ({ label: `working/${b}`, to: "working" as const, band: b })),
  { label: "gate", to: "gate", band: null },
  { label: "done", to: "done", band: null },
];

async function loaded() {
  const src = makeArticlesSource({ now: () => NOW });
  const entries = await src.loadPipeline();
  const byId = new Map(entries.map((e) => [e.item.id, e.item]));
  return { src, entries, item: (status: ArticleStatus): PipelineItem => byId.get(`articles:run-${status}`)! };
}

/* ── Articles ─────────────────────────────────────────────────────────────── */

test("articles pipeline: admits() reads the transition table for every status x target, and refuses in the store's own sentence", async () => {
  const f = install(articlesApi(ALL_STATUS_RUNS.map((r) => (r.status === "landed" ? { ...r, landedAt: iso(1) } : r.status === "rejected" ? { ...r, rejection: { at: iso(1), note: "no" } } : r))));
  try {
    const { src, item } = await loaded();
    const lines: string[] = [];
    lines.push(["from \\ to".padEnd(20), ...TARGETS.map((t) => t.label.padEnd(17))].join(""));
    for (const status of ARTICLE_STATUSES) {
      const it = item(status);
      expect(it, `${status} is drawn`).toBeTruthy();
      const cells: string[] = [];
      for (const t of TARGETS) {
        const offer = src.admits(it, t.to, t.band);
        const here = src.placementOf(it);
        const sameCell = t.to === here.stage && t.band === here.band;
        cells.push(
          offer.kind === "needs"
            ? `needs:${offer.needs}`
            : offer.kind === "ok"
              ? "ok"
              : sameCell
                ? "here"
                : / cannot become /.test(offer.reason)
                  ? "no:table"
                  : /nobody is waiting/.test(offer.reason)
                    ? "no:engine"
                    : /failed at/.test(offer.reason)
                      ? "no:failed"
                      : "no:other",
        );
        if (sameCell) continue; // the lane-only cell has its own refusal
        if (t.to === "proposed") continue;
        const target = ({ gate: "awaiting-approval", done: status === "awaiting-approval" ? "approved" : "landed", working: `${t.band === "research" ? "researching" : t.band === "draft" ? "drafting" : t.band === "critique" ? "critiquing" : "checking"}` } as const)[t.to as "gate" | "done" | "working"] as ArticleStatus;
        const forbidden = !canTransition(status, target);
        const sentence = articleTransitionRefusal(status, target);
        if (forbidden) expect(offer, `${status} -> ${t.label}`).toEqual({ kind: "refused", reason: sentence });
        else expect(offer.kind === "refused" && offer.reason === sentence, `${status} -> ${t.label} is legal by the table`).toBe(false);
      }
      lines.push([status.padEnd(20), ...cells.map((c) => c.padEnd(17))].join(""));
    }
    console.log(`\nARTICLES admits() matrix (11 statuses x ${TARGETS.length} targets)\n${lines.join("\n")}`);
  } finally {
    f.restore();
  }
});

test("articles pipeline: the three named offers - dispatch carries RUN_COST_HINT and its date, rework asks for a note, approve asks to confirm", async () => {
  const f = install(articlesApi(ALL_STATUS_RUNS));
  try {
    const { src, item, entries } = await loaded();
    const topicItem = entries.map((e) => e.item).find((i) => i.id.startsWith("articles:topic:"))!;
    const dispatch = src.admits(topicItem, "working", "research");
    expect(dispatch.kind).toBe("needs");
    if (dispatch.kind !== "needs") throw new Error("unreachable");
    expect(dispatch.needs).toBe("confirm");
    expect(dispatch.cost).toMatchObject({ usdLow: RUN_COST_HINT.usdLow, usdHigh: RUN_COST_HINT.usdHigh, turnsLow: RUN_COST_HINT.turnsLow, turnsHigh: RUN_COST_HINT.turnsHigh });
    expect(dispatch.cost!.note).toContain(RUN_COST_HINT.measured);
    // a run starts at research: dropping a topic on a later band would imply skipped work
    expect(src.admits(topicItem, "working", "critique")).toEqual({ kind: "refused", reason: "a run starts at research" });

    const rework = src.admits(item("awaiting-approval"), "working", "draft");
    expect(rework).toMatchObject({ kind: "needs", needs: "note" });
    const approve = src.admits(item("awaiting-approval"), "done", null);
    expect(approve).toMatchObject({ kind: "needs", needs: "confirm" });
    console.log(`\nARTICLES offers\n  dispatch: ${JSON.stringify(dispatch)}\n  rework:   ${JSON.stringify(rework)}\n  approve:  ${JSON.stringify(approve)}`);
  } finally {
    f.restore();
  }
});

test("articles pipeline: the engine's own steps are refused as the engine's, not as a table violation", async () => {
  const f = install(articlesApi(ALL_STATUS_RUNS));
  try {
    const { src, item } = await loaded();
    // researching -> drafting is LEGAL in the table; it is the machine's step.
    expect(canTransition("researching", "drafting")).toBe(true);
    expect(src.admits(item("researching"), "working", "draft")).toEqual({ kind: "refused", reason: articleMachineRefusal("researching", "drafting") });
    // a failed run is not resumed by a drop: the engine picks the step
    const offer = src.admits(item("failed"), "working", "research");
    expect(offer.kind).toBe("refused");
    expect(offer.kind === "refused" && offer.reason).toContain("failed at critique");
    // a lane-only drop is refused: the row is the topic's bundle
    const here = src.placementOf(item("drafting"));
    const lane = src.admits(item("drafting"), here.stage, here.band);
    expect(lane.kind).toBe("refused");
  } finally {
    f.restore();
  }
});

test("articles pipeline: every status is drawn somewhere (or hidden, counted) - none is silently dropped", async () => {
  const runs = ALL_STATUS_RUNS.map((r) => (r.status === "landed" ? { ...r, landedAt: iso(1) } : r.status === "rejected" ? { ...r, rejection: { at: iso(1), note: "no" } } : r));
  const f = install(articlesApi(runs));
  try {
    const { src, item } = await loaded();
    const where: Record<string, string> = {};
    for (const s of ARTICLE_STATUSES) {
      const p = src.placementOf(item(s));
      where[s] = `${p.stage}${p.band ? `/${p.band}` : ""}`;
    }
    console.log(`\nARTICLES placement by status\n${JSON.stringify(where, null, 2)}`);
    expect(where).toMatchObject({
      queued: "working/research",
      researching: "working/research",
      drafting: "working/draft",
      critiquing: "working/critique",
      checking: "working/check",
      "awaiting-approval": "gate",
      approved: "done",
      landing: "done",
      landed: "done",
      rejected: "done",
      failed: "working/critique", // where its failed step is
    });
    expect(src.stages).toEqual([...CANON_STAGES]);
    expect(isPipelineSource(src)).toBe(true);
  } finally {
    f.restore();
  }
});

test("articles pipeline: a landed post leaves after 7 days on landedAt - not updatedAt - and a run with no landedAt is counted, not guessed", async () => {
  const runs = [
    run("fresh", "landed", { landedAt: iso(DONE_WINDOW_DAYS - 1), updatedAt: iso(0) }),
    run("old", "landed", { landedAt: iso(DONE_WINDOW_DAYS + 1), updatedAt: iso(0) }), // touched today, landed 8 days ago
    run("legacy", "landed", { updatedAt: iso(0) }),
    run("no", "rejected", { rejection: { at: iso(DONE_WINDOW_DAYS + 3), note: "n" } }),
  ];
  const f = install(articlesApi(runs, []));
  try {
    const src = makeArticlesSource({ now: () => NOW });
    const ids = (await src.loadPipeline()).map((e) => e.item.id);
    expect(ids).toEqual(["articles:fresh"]);
    const hidden = src.lastLoad().hidden;
    expect(hidden.reduce((a, h) => a + h.count, 0)).toBe(3);
    expect(hidden.map((h) => h.why).join("|")).toContain("no recorded date");
    console.log(`\nARTICLES hidden: ${JSON.stringify(hidden)}`);
  } finally {
    f.restore();
  }
});

test("articles pipeline: groupAxes lists only axes every run carries; category and projectId are not offered", async () => {
  const f = install(articlesApi(ALL_STATUS_RUNS));
  try {
    const { src, entries, item } = await loaded();
    expect(src.groupAxes.map((a) => a.id)).toEqual(["bundle", "status", "model", "effort"]);
    expect(src.groupAxes[0].id).toBe("bundle");
    expect(src.groupAxes.some((a) => a.id === "category" || a.id === "projectId")).toBe(false);
    // a free topic has no bundle: it takes the ungrouped row
    const free = run("free-run", "drafting", { topic: { kind: "free", text: "something" } });
    f.restore();
    const g = install(articlesApi([free]));
    const s2 = makeArticlesSource({ now: () => NOW });
    const e2 = await s2.loadPipeline();
    const freeItem = e2.find((e) => e.item.id === "articles:free-run")!.item;
    expect(s2.groupAxes[0].of(freeItem)).toBe(UNGROUPED_LANE);
    // a topic has no status/model/effort yet: the unwritten row, not a made-up one
    const t = e2.find((e) => e.item.id.startsWith("articles:topic:"))!.item;
    expect(s2.groupAxes[1].of(t)).toBe(UNGROUPED_LANE);
    g.restore();
    void entries;
    void item;
  } finally {
    f.restore();
  }
});

test("articles pipeline: an unset `live` calls no write route; live:true reaches exactly one", async () => {
  const f = install((url, method, body) => {
    if (method === "POST" && url.pathname === "/api/articles") return json({ run: run("new-run", "queued", { topic: { kind: "subject", bundle: "media-generation", subject: "frame-direction", text: "frame direction" } }) }, 201);
    return articlesApi(ALL_STATUS_RUNS)(url, method, body);
  });
  try {
    const { src, entries } = await loaded();
    const t = entries.map((e) => e.item).find((i) => i.id.startsWith("articles:topic:"))!;
    const req = { itemId: t.id, to: "working" as const, band: "research" };

    const dry = await src.move(req);
    expect(isStubbedMove(dry)).toBe(true);
    expect(f.writes()).toHaveLength(0);

    const live = await src.move({ ...req, live: true });
    expect(isStubbedMove(live)).toBe(false);
    expect(live.ok).toBe(true);
    expect(f.writes().map((w) => `${w.method} ${w.path}`)).toEqual(["POST /api/articles"]);
    expect(f.writes()[0].body).toMatchObject({ topic: { kind: "subject", bundle: "media-generation", subject: "frame-direction" } });
    if (live.ok) expect(live.item.placement).toMatchObject({ stage: "working", band: "research" });

    // rework without a note is refused before any call
    const it = (await src.loadPipeline()).find((e) => e.item.id === "articles:run-awaiting-approval")!.item;
    const noNote = await src.move({ itemId: it.id, to: "working", band: "draft", live: true });
    expect(noNote).toMatchObject({ ok: false, retryable: false });
    expect(f.writes()).toHaveLength(1);
  } finally {
    f.restore();
  }
});

test("articles pipeline: a transport failure is retryable, the authority's refusal is not, and both carry its words", async () => {
  let mode: "down" | "refuse" = "down";
  const f = install((url, method, body) => {
    if (method === "POST" && url.pathname === "/api/articles") return mode === "down" ? "network-down" : json({ error: "the registry is not reachable", code: "registry-down" }, 503);
    return articlesApi(ALL_STATUS_RUNS)(url, method, body);
  });
  try {
    const { src, entries } = await loaded();
    const t = entries.map((e) => e.item).find((i) => i.id.startsWith("articles:topic:"))!;
    const req = { itemId: t.id, to: "working" as const, band: "research", live: true };
    expect(await src.move(req)).toEqual({ ok: false, reason: "the studio server could not be reached", retryable: true });
    mode = "refuse";
    expect(await src.move(req)).toEqual({ ok: false, reason: "the registry is not reachable", retryable: false });
  } finally {
    f.restore();
  }
});

test("articles pipeline: unreadable is unavailable or error, never an empty lane; genuinely empty is empty", async () => {
  const states: Record<string, string> = {};
  const probeState = async (label: string, handler: Handler) => {
    const f = install(handler);
    try {
      const src = makeArticlesSource({ now: () => NOW });
      try {
        const entries = await src.loadPipeline();
        const base = stateOfEntries({ total: entries.length, pending: 0, decided: 0, rejected: 0 }, []).kind === "empty" && entries.length === 0 ? "empty" : `loaded(${entries.length})`;
        const down = src.lastLoad?.().degraded;
        states[label] = down?.length ? `${base}+degraded(${down.map((d) => d.stage).join(",")})` : base;
      } catch (e) {
        const s = stateOfError(e);
        states[label] = s.kind === "unavailable" ? `unavailable{${s.reason}}` : s.kind === "error" ? `error{${s.message}}` : s.kind;
      }
    } finally {
      f.restore();
    }
  };
  await probeState("network down", () => "network-down");
  await probeState("route not built (404, no body)", () => new Response("<html>404</html>", { status: 404 }));
  await probeState("signed out (401)", () => json({ detail: "set the access secret" }, 401));
  await probeState("server error (500)", (url) => (url.pathname === "/api/articles" ? json({ error: "run.json is corrupt" }, 500) : articlesApi([])(url, "GET", undefined)));
  await probeState("topics route 404 (runs fine)", (url, m, b) => (url.pathname === "/api/articles/topics" ? new Response("nope", { status: 404 }) : articlesApi([])(url, m, b)));
  await probeState("topics registry 503 (runs fine)", (url, m, b) => (url.pathname === "/api/articles/topics" ? json({ error: "the registry cannot be reached" }, 503) : articlesApi([])(url, m, b)));
  await probeState("nothing yet (empty store, no topics)", articlesApi([], []));
  console.log(`\nARTICLES source states\n${JSON.stringify(states, null, 2)}`);
  expect(states["network down"]).toMatch(/^unavailable\{/);
  expect(states["route not built (404, no body)"]).toMatch(/^unavailable\{/);
  expect(states["signed out (401)"]).toMatch(/^unavailable\{/);
  expect(states["server error (500)"]).toBe("error{run.json is corrupt}");
  // A TOPICS FAILURE DEGRADES ONE COLUMN; IT DOES NOT FAIL THE LANE. Topics come
  // from the sibling ai-registry, which may simply not be on this machine, while
  // the other three columns come from the studio. Failing the load here would
  // take the GATE column - the one with work waiting in it - down to report an
  // absent sibling. So the lane still loads, and `proposed` carries its reason.
  expect(states["topics route 404 (runs fine)"]).toMatch(/\+degraded\(proposed\)$/);
  expect(states["topics registry 503 (runs fine)"]).toMatch(/\+degraded\(proposed\)$/);
  expect(states["nothing yet (empty store, no topics)"]).toBe("empty");
});

test("articles pipeline: a topics failure degrades the proposed column and the rest of the lane still draws", async () => {
  const runs = ALL_STATUS_RUNS.map((r) => (r.status === "rejected" ? { ...r, rejection: { at: iso(1), note: "n" } } : r));

  // Control first: with topics reachable, `degraded` is absent. Without this the
  // assertion below would pass on a source that reports every load as degraded.
  const ok = install(articlesApi(runs));
  let healthy;
  try {
    const src = makeArticlesSource({ now: () => NOW });
    await src.loadPipeline();
    healthy = src.lastLoad();
  } finally {
    ok.restore();
  }
  expect(healthy?.degraded).toBeUndefined();

  const f = install((url, m, b) => (url.pathname === "/api/articles/topics" ? json({ error: "the registry cannot be reached" }, 503) : articlesApi(runs)(url, m, b)));
  try {
    const src = makeArticlesSource({ now: () => NOW });
    const entries = await src.loadPipeline();
    const notes = src.lastLoad();
    console.log(`
TOPICS DOWN -> degraded ${JSON.stringify(notes?.degraded)} · drew ${entries.length} entries`);

    // The column that failed says why, naming the stage.
    expect(notes?.degraded).toEqual([{ stage: "proposed", reason: "the registry cannot be reached" }]);
    // And no candidate is drawn as if the column were merely empty.
    expect(entries.filter((e) => e.placement.stage === "proposed")).toHaveLength(0);
    // The gate column - the whole point - still has its run.
    expect(entries.some((e) => e.placement.stage === "gate")).toBe(true);
  } finally {
    f.restore();
  }
});

test("articles: the verdict half is untouched - load() still lists only runs that reached the gate", async () => {
  const f = install(articlesApi(ALL_STATUS_RUNS.map((r) => (r.status === "rejected" ? { ...r, rejection: { at: iso(1), note: "n" } } : r))));
  try {
    const src = makeArticlesSource({ now: () => NOW });
    const ids = (await src.load()).map((i) => i.id).sort();
    expect(ids).toEqual(["articles:run-awaiting-approval", "articles:run-rejected"]);
    expect(Object.keys(src).sort()).toEqual(expect.arrayContaining(["count", "decide", "load", "loadEntries", "commitsOn", "exclusive", "native", "reasonAxes"]));
  } finally {
    f.restore();
  }
});

/* ── Audio ────────────────────────────────────────────────────────────────── */

function take(id: string, extra: Partial<SoundTake> = {}): SoundTake {
  return {
    id,
    kind: "music",
    title: `take ${id}`,
    provider: "elevenlabs",
    op: "compose",
    origin: "lab",
    technique: [],
    prompt: "a slow pad",
    negative: null,
    terms: { genre: ["ambient"], mood: ["calm"], instrument: [], sfxCategory: null },
    tempoBpm: null,
    key: null,
    durationS: 20,
    loop: null,
    file: { path: `files/${id}.mp3`, mime: "audio/mpeg", bytes: 1000 },
    peaks: null,
    measured: null,
    ratings: {},
    verdict: "kept",
    reasons: [],
    note: null,
    stage: "pending",
    group: "ambient",
    label: null,
    parentId: null,
    huntId: null,
    nodeId: null,
    songId: null,
    plan: null,
    referenceTrackId: null,
    promptRound: null,
    draftId: null,
    variation: null,
    editModes: null,
    fileName: null,
    projectId: null,
    cueId: null,
    createdAt: iso(2),
    judgedAt: iso(1),
    finalizedAt: null,
    ...extra,
  };
}

function leaf(id: string, extra: Partial<HuntNode> = {}): HuntNode {
  return {
    id,
    parentId: null,
    axis: "tempo",
    label: `leaf ${id}`,
    rationale: "because",
    provider: "elevenlabs",
    technique: [],
    prompt: "slower",
    negative: null,
    durationS: 12,
    loop: null,
    terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
    tempoBpm: null,
    key: null,
    state: "idea",
    takeIds: [],
    winner: false,
    error: null,
    ...extra,
  };
}

const hunt = (nodes: HuntNode[]): Hunt => ({ id: "h1", kind: "music", idea: "calmer pad", createdAt: iso(3), nodes, draftedBy: null, lessonId: null });
const GROUPS = { music: ["ambient", "cinematic", "electronic", "hip hop"], sfx: ["impacts", "whooshes", "risers", "ambiences", "ui"] };

function soundApi(takes: SoundTake[], hunts: Hunt[], groups = GROUPS): Handler {
  return (url, method) => {
    if (url.pathname === "/api/sound/takes" && method === "GET") return json({ takes });
    if (url.pathname === "/api/sound/hunts" && method === "GET") return json({ hunts });
    if (url.pathname === "/api/sound/groups") return json({ groups });
    return json({ error: "unrouted in the probe" }, 404);
  };
}

async function audioLoaded() {
  const src = makeAudioSource({ now: () => NOW });
  const entries = await src.loadPipeline();
  const get = (id: string) => entries.find((e) => e.item.id === id)!.item;
  return { src, entries, get };
}

test("audio pipeline: every stage lands where the canon says, and the pool reads as empty until a hunt is drafted", async () => {
  const takes = [
    take("a", { stage: "pending" }),
    take("b", { stage: "remaster" }),
    take("c", { stage: "edit" }),
    take("d", { stage: "finalized", label: "Ambient · calm", finalizedAt: iso(1) }),
    take("e", { verdict: "unjudged", stage: null, judgedAt: null }),
    take("f", { verdict: "rejected", stage: null }),
  ];
  const f = install(soundApi(takes, [hunt([leaf("n1"), leaf("n2", { state: "rendered" }), leaf("n3", { state: "awaiting-return", provider: "suno" })])]));
  try {
    const { src, entries, get } = await audioLoaded();
    const site = (id: string) => {
      const p = src.placementOf(get(id));
      return `${p.stage}${p.band ? `/${p.band}` : ""}`;
    };
    const placed = { a: site("audio:take:a"), b: site("audio:take:b"), c: site("audio:take:c"), d: site("audio:take:d"), e: site("audio:take:e"), idea: site("audio:hunt:h1:n1") };
    console.log(`\nAUDIO placement\n${JSON.stringify(placed, null, 2)}`);
    expect(placed).toEqual({ a: "gate/pending", b: "gate/remaster", c: "gate/edit", d: "done", e: "gate/triage", idea: "proposed" });
    // a rejected take has no stage; a rendered / awaiting-return leaf is drawn as its takes
    expect(entries.map((e) => e.item.id)).not.toContain("audio:take:f");
    expect(src.lastLoad().hidden).toEqual([{ stage: "proposed", count: 1, why: "hunt leaves rendering or awaiting a Suno return" }]);
  } finally {
    f.restore();
  }
});

test("audio pipeline: finalize asks for a label (with the suggestion), a labelled take does not, lane moves are writable, a non-kept take is refused", async () => {
  const takes = [take("a"), take("b", { label: "Ambient · calm" }), take("u", { verdict: "unjudged", stage: null, judgedAt: null })];
  const f = install(soundApi(takes, []));
  try {
    const { src, get } = await audioLoaded();
    const finalize = src.admits(get("audio:take:a"), "done", null);
    console.log(`\nAUDIO finalize offer: ${JSON.stringify(finalize)}`);
    expect(finalize).toMatchObject({ kind: "needs", needs: "label" });
    expect(finalize.kind === "needs" && finalize.prompt).toContain("Ambient");
    expect(src.admits(get("audio:take:b"), "done", null)).toEqual({ kind: "ok" });
    // same stage, same band: a lane move, and the server writes `group`
    expect(src.admits(get("audio:take:a"), "gate", "pending")).toEqual({ kind: "ok" });
    expect(src.admits(get("audio:take:a"), "gate", "remaster")).toEqual({ kind: "ok" });
    // un-keeping, or going back to being an idea, is not a drag
    expect(src.admits(get("audio:take:a"), "gate", "triage").kind).toBe("refused");
    expect(src.admits(get("audio:take:a"), "proposed", null).kind).toBe("refused");
    // applyRules clears a non-kept take's stage: refuse it before the write
    expect(src.admits(get("audio:take:u"), "gate", "pending")).toEqual({ kind: "refused", reason: AUDIO_UNJUDGED_REFUSAL });
    expect(src.admits(get("audio:take:u"), "done", null)).toEqual({ kind: "refused", reason: AUDIO_UNJUDGED_REFUSAL });
  } finally {
    f.restore();
  }
});

test("audio pipeline: a move writes ONE patch through the sound route, and the server's refusal is returned verbatim, not retryable", async () => {
  const takes = [take("a")];
  let fail = false;
  const f = install((url, method, body) => {
    if (method === "PATCH" && url.pathname === "/api/sound/takes/a") {
      if (fail) return json({ error: "a finalized take needs a library label — it is what agents select it by" }, 409);
      return json({ take: { ...takes[0], ...(body as object), finalizedAt: iso(0) } });
    }
    return soundApi(takes, [])(url, method, body);
  });
  try {
    const { src, get } = await audioLoaded();
    const it = get("audio:take:a");
    const noLabel = await src.move({ itemId: it.id, to: "done", band: null });
    expect(noLabel).toMatchObject({ ok: false, retryable: false });
    expect(f.writes()).toHaveLength(0); // refused in the hand, before the write

    const done = await src.move({ itemId: it.id, to: "done", band: null, label: "Ambient · calm", lane: "cinematic" });
    expect(done.ok).toBe(true);
    expect(f.writes()).toHaveLength(1);
    expect(f.writes()[0]).toMatchObject({ method: "PATCH", path: "/api/sound/takes/a", body: { stage: "finalized", label: "Ambient · calm", group: "cinematic" } });
    if (done.ok) expect(done.item.placement).toMatchObject({ stage: "done", lane: "cinematic" });

    fail = true;
    const { src: s2, get: g2 } = await audioLoaded();
    const refused = await s2.move({ itemId: g2("audio:take:a").id, to: "gate", band: "edit" });
    expect(refused).toEqual({ ok: false, reason: "a finalized take needs a library label — it is what agents select it by", retryable: false });
  } finally {
    f.restore();
  }
});

test("audio pipeline: declared rows first in their declared order, then rows only in the data, ungrouped last", async () => {
  const takes = [take("a", { group: "zzz-orphan" }), take("b", { group: null }), take("c", { group: "cinematic" })];
  const f = install(soundApi(takes, []));
  try {
    const { src, entries } = await audioLoaded();
    const keys = src.lanes(entries.map((e) => e.item), src.groupAxes[0]).map((l) => l.key);
    expect(keys).toEqual([...GROUPS.music, ...GROUPS.sfx, "zzz-orphan", UNGROUPED_LANE]);
    console.log(`\nAUDIO lanes: ${JSON.stringify(keys)}`);
    expect(src.groupAxes.map((a) => a.id)).toEqual(["group", "genre", "provider", "op", "origin"]);
    expect(src.groupAxes.some((a) => a.id === "projectId" || a.id.includes("duration"))).toBe(false);
  } finally {
    f.restore();
  }
});

test("audio pipeline: working is a request in flight - it vanishes on success into triage, and a failure returns the card wearing the vendor's sentence", async () => {
  let release!: (r: Response) => void;
  const gate = new Promise<Response>((res) => (release = res));
  let outcome: "ok" | "over-budget" = "ok";
  const f = install((url, method, body) => {
    if (method === "POST" && url.pathname === "/api/sound/generate") {
      return outcome === "ok" ? gate : json({ error: "Music render ceiling reached: refused before the vendor was called", code: "over-budget" }, 402);
    }
    if (method === "PATCH" && url.pathname.startsWith("/api/sound/takes/")) return json({ take: take("new", { verdict: "unjudged", stage: null, group: (body as { group: string }).group, judgedAt: null }) });
    return soundApi([], [hunt([leaf("n1"), leaf("n2", { provider: "suno" })])])(url, method, body);
  });
  try {
    const { src, get } = await audioLoaded();
    const idea = get("audio:hunt:h1:n1");

    // the offer states SECONDS, not dollars
    const offer = src.admits(idea, "working", null);
    expect(offer).toMatchObject({ kind: "needs", needs: "confirm", cost: { seconds: 12 } });
    expect(offer.kind === "needs" && "usdLow" in (offer.cost ?? {})).toBe(false);
    // Suno is a manual round trip: refused before any call
    expect(src.admits(get("audio:hunt:h1:n2"), "working", null).kind).toBe("refused");

    // dry path: no write, and the caller can tell
    const dry = await src.move({ itemId: idea.id, to: "working", band: null });
    expect(isStubbedMove(dry)).toBe(true);
    expect(f.writes()).toHaveLength(0);

    // a lane drop on a candidate is interface-local, then written as the group after the render
    const laned = await src.move({ itemId: idea.id, to: "proposed", band: null, lane: "cinematic" });
    expect(laned.ok && laned.item.lane).toBe("cinematic");
    expect(f.writes()).toHaveLength(0);

    // live: the call is held open; while it is, the card is in `working`, once
    const live = src.move({ itemId: idea.id, to: "working", band: null, live: true });
    await new Promise((r) => setTimeout(r, 10));
    const during = await src.loadPipeline();
    const inflight = during.filter((e) => e.item.placement.stage === "working");
    expect(inflight.map((e) => e.item.id)).toEqual([idea.id]);
    expect(during.filter((e) => e.item.id === idea.id)).toHaveLength(1);
    expect(src.admits(inflight[0].item, "gate", "triage")).toEqual({ kind: "refused", reason: "a render is in flight; wait for the vendor's answer" });
    release(json({ take: take("new", { verdict: "unjudged", stage: null, group: null, judgedAt: null, prompt: "slower", title: "leaf n1 — compose" }) }, 201));
    const done = await live;
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.item.placement).toMatchObject({ stage: "gate", band: "triage", lane: "cinematic" });
    const gen = f.writes().find((w) => w.path === "/api/sound/generate")!;
    expect(gen.body).toMatchObject({ kind: "music", provider: "elevenlabs", op: "compose", origin: "hunt", huntId: "h1", nodeId: "n1", durationS: 12 });
    // nothing left in working
    expect((await src.loadPipeline()).filter((e) => e.item.placement.stage === "working")).toHaveLength(0);

    // failure: vendor's words, retryable only for transport; the card comes back wearing them
    outcome = "over-budget";
    const typed = src.propose({ kind: "sfx", prompt: "glass breaking", durationS: 2 });
    expect(src.placementOf(typed)).toMatchObject({ stage: "proposed" });
    const failed = await src.move({ itemId: typed.id, to: "working", band: null, live: true });
    expect(failed).toEqual({ ok: false, reason: "Music render ceiling reached: refused before the vendor was called", retryable: false });
    const back = (await src.loadPipeline()).find((e) => e.item.id === typed.id)!.item;
    expect(back.placement.stage).toBe("proposed");
    expect(back.note).toBe("Music render ceiling reached: refused before the vendor was called");
    expect(src.discard(typed.id)).toBe(true);
    expect((await src.loadPipeline()).some((e) => e.item.id === typed.id)).toBe(false);
  } finally {
    f.restore();
  }
});

test("audio pipeline: unreadable is unavailable or error, never an empty lane; genuinely empty is empty", async () => {
  const states: Record<string, string> = {};
  const probeState = async (label: string, handler: Handler) => {
    const f = install(handler);
    try {
      const src = makeAudioSource({ now: () => NOW });
      try {
        const entries = await src.loadPipeline();
        states[label] = entries.length === 0 && stateOfEntries({ total: 0, pending: 0, decided: 0, rejected: 0 }, []).kind === "empty" ? "empty" : `loaded(${entries.length})`;
      } catch (e) {
        const s = stateOfError(e);
        states[label] = s.kind === "unavailable" ? `unavailable{${s.reason}}` : s.kind === "error" ? `error{${s.message}}` : s.kind;
      }
    } finally {
      f.restore();
    }
  };
  await probeState("network down", () => "network-down");
  await probeState("route not built (404, no body)", () => new Response("<html>404</html>", { status: 404 }));
  await probeState("signed out (401)", () => json({ error: "set the access secret" }, 401));
  await probeState("hunts 500 (takes fine)", (url, m, b) => (url.pathname === "/api/sound/hunts" ? json({ error: "hunts.json is corrupt" }, 500) : soundApi([], [])(url, m, b)));
  await probeState("groups 500 (takes fine)", (url, m, b) => (url.pathname === "/api/sound/groups" ? json({ error: "groups.json is corrupt" }, 500) : soundApi([], [])(url, m, b)));
  await probeState("empty store, no hunt drafted", soundApi([], []));
  console.log(`\nAUDIO source states\n${JSON.stringify(states, null, 2)}`);
  expect(states["network down"]).toMatch(/^unavailable\{/);
  expect(states["route not built (404, no body)"]).toMatch(/^unavailable\{/);
  expect(states["signed out (401)"]).toMatch(/^unavailable\{/);
  expect(states["hunts 500 (takes fine)"]).toBe("error{hunts.json is corrupt}");
  expect(states["groups 500 (takes fine)"]).toBe("error{groups.json is corrupt}");
  expect(states["empty store, no hunt drafted"]).toBe("empty");
});

test("audio pipeline: the verdict half is refused by name - a take is judged in Triage", async () => {
  const f = install(soundApi([], []));
  try {
    const src = makeAudioSource({ now: () => NOW });
    await expect(src.decide("audio:take:a", "approve")).rejects.toThrow(/Triage/);
  } finally {
    f.restore();
  }
});

test("the topic limit is stated, not silent: topics past it are counted", async () => {
  const f = install(articlesApi([], [topic("a"), topic("b")], 2 + 7));
  try {
    const src = makeArticlesSource({ now: () => NOW });
    await src.loadPipeline();
    expect(src.lastLoad().hidden).toEqual([{ stage: "proposed", count: 7, why: `uncovered topics past the first ${TOPIC_LIMIT}` }]);
  } finally {
    f.restore();
  }
});

// keep the offer type referenced so a renamed MoveOffer fails this file, not just the adapters
export type _Offer = MoveOffer;
