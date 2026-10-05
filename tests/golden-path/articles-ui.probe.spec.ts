// LANE — THE /articles SURFACE: ITS ROUTES, ITS READING OF A RUN, AND ITS BOARD
// SOURCE (dynamic, offline).
//
// The /api/articles route handlers are plain `(Request, ctx) => Response`
// functions, so they are called directly (as foundry-routes.probe.spec.ts
// does) against a THROWAWAY registry and run store (./_articles.ts): the stub
// agent through the real seam, a stub `gh`, a bare origin. Nothing spends,
// nothing reaches the network, the real registry is never named.
//
// What is pinned, the way step-sign-off.probe.spec.ts pins sign-off — the act,
// then what the store holds after it:
//
//   · every seeded state (tests/fixtures/articles/runStates.ts) reads back
//     through GET /api/articles/<id> as the phase the page draws, with the
//     extras the route adds (driving, agent receipt, landing.log) present
//     exactly when their file is
//   · approve writes `approval {patches}` and the launched landing reaches
//     `landed` with a branch on the origin; reject writes the note; resume
//     takes a failed run back to its step; create starts a run that reaches
//     the gate. Each refuses the wrong state, an unknown run (WITHOUT leaving a
//     directory behind) and a malformed body
//   · the file route serves the post under a no-network, no-script CSP and
//     nothing outside post/, check/, medium/
//   · the Board's articles source over the same routes: counts, entries,
//     refusals by name, and a reject that writes reasons into the note

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";

import { GET as listGET, POST as createPOST } from "@/app/api/articles/route";
import { GET as detailGET } from "@/app/api/articles/[runId]/route";
import { POST as approvePOST } from "@/app/api/articles/[runId]/approve/route";
import { POST as rejectPOST } from "@/app/api/articles/[runId]/reject/route";
import { POST as resumePOST } from "@/app/api/articles/[runId]/resume/route";
import { GET as fileGET } from "@/app/api/articles/[runId]/file/[...path]/route";
import { carryKey } from "@/app/api/articles/_lib/respond";
import type { RunDetail, RunList } from "@/app/articles/articlesClient";
import { checkOrder, costOf, countBySeverity, findingGroups, latestRound, nodesOf, phaseOf, reviewerRows, roundTimeline } from "@/app/articles/runModel";
import { liveOf, START_GRACE_MS } from "@/app/articles/useArticles";
import { createRun, defaultDeps, driveRun } from "@/lib/articles/engine";
import { readRun, runDir } from "@/lib/articles/store";
import type { ArticleRun, CheckReport } from "@/lib/articles/types";
import { ARTICLE_CLEAR_REFUSAL, ARTICLE_NOTE_REFUSAL, articleEntry, makeArticlesSource } from "@/lib/board/sources/articles";
import { VerdictRefused } from "@/lib/board/source";
import { fromArticle } from "@/lib/board/verdicts";

import { seedRunStates, SEED_STATES, type SeedState } from "../fixtures/articles/runStates";
import { keepEnv } from "./_helpers";
import { ARTICLE_ENV, articleSandbox, type ArticleSandbox } from "./_articles";

keepEnv([...ARTICLE_ENV, "NEXT_PUBLIC_DEV_AUTH", ACCESS_SECRET_VAR]);
test.describe.configure({ timeout: 180_000 });

let box: ArticleSandbox;
test.beforeEach(() => {
  box = articleSandbox();
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
});
test.afterEach(() => box.cleanup());

const deps = () => defaultDeps({ render: false });
async function toGate(text = "the token tax"): Promise<ArticleRun> {
  const run = await createRun({ topic: { kind: "free", text } }, deps());
  return driveRun(run.id, deps());
}

const at = (p: string, init: RequestInit = {}) => new Request(`http://studio.local${p}`, { ...init, headers: { "content-type": "application/json", "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(init.headers ?? {}) } });
const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const post = (p: string, body?: unknown) => at(p, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

async function detail(id: string): Promise<RunDetail> {
  const res = await detailGET(at(`/api/articles/${id}`), ctx({ runId: id }));
  expect(res.status, `GET ${id}`).toBe(200);
  return (await res.json()) as RunDetail;
}

/** Wait until the run directory says the background drive has stopped. */
async function settle(id: string, want: ArticleRun["status"][], ms = 90_000): Promise<ArticleRun> {
  const t0 = Date.now();
  for (;;) {
    const r = await readRun(id);
    if (want.includes(r.status) && !existsSync(path.join(runDir(id), ".driver"))) return r;
    if (Date.now() - t0 > ms) throw new Error(`run ${id} stuck at ${r.status} (${r.error ?? "no error"})`);
    await new Promise((res) => setTimeout(res, 150));
  }
}

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

/* ── the reading of a run ─────────────────────────────────────────────── */

const PHASE_OF_SEED: Record<SeedState, string> = {
  researching: "running",
  drafting: "running",
  stalled: "stalled",
  failed: "failed",
  unreachable: "failed",
  "critique-running": "running",
  "critique-partial": "gate",
  "critique-quorum": "failed",
  "critique-keep": "gate",
  "critique-rewrite": "gate",
  gate: "gate",
  landing: "landing",
  landed: "landed",
  "land-failed": "failed",
  rejected: "rejected",
};

test("case 1: every seeded state reads back through GET /api/articles/<id> as the phase the page draws", async () => {
  const gate = await toGate();
  const ids = seedRunStates(box.store, gate.id, { driverPid: process.pid });
  for (const state of SEED_STATES) {
    const d = await detail(ids[state]);
    // `at` far past the grace window: only a live lease may read as working.
    const phase = phaseOf(d.run, liveOf(d, Date.parse(d.run.updatedAt) + START_GRACE_MS * 10));
    expect(phase, state).toBe(PHASE_OF_SEED[state]);
  }

  // The extras are present exactly when their file is.
  const failed = await detail(ids.failed);
  expect(failed.agent.draft).toMatchObject({ outcome: "seat-limit", turns: 2, errors: ["Claude AI usage limit reached"] });
  expect(failed.post, "a failed draft has no post").toBeUndefined();
  expect(failed.landingLog).toBeUndefined();
  expect(nodesOf(failed.run, false).map((n) => n.state)).toEqual(["done", "done", "failed", "pending", "pending", "pending"]);
  expect(failed.critique, "a run that failed before its critique has no critique").toBeUndefined();
  expect(failed.run.critique).toBeUndefined();

  const landFailed = await detail(ids["land-failed"]);
  expect(landFailed.landingLog).toMatch(/title asks the gate to fail/);
  expect(landFailed.run.approval?.patches).toEqual(["p1"]);
  expect(nodesOf(landFailed.run, false).at(-1)?.state, "an approved run's gate is done even when landing failed").toBe("done");

  const researching = await detail(ids.researching);
  expect(researching.driving).toBe(true);
  expect(researching.sources, "research has not finished: no sources yet").toEqual([]);
  expect(nodesOf(researching.run, true).map((n) => n.state)).toEqual(["running", "pending", "pending", "pending", "pending", "pending"]);
  expect(nodesOf(researching.run, false)[0].state, "a running step with no driver is stalled").toBe("stalled");

  const drafting = await detail(ids.drafting);
  expect(drafting.sources.length, "sources appear once research is done").toBe(8);
  expect(drafting.post).toBeUndefined();

  const g = await detail(ids.gate);
  expect(g.post).toBe("post/index.html");
  expect(g.patches.map((p) => p.id)).toEqual(["p1", "p2"]);
  expect(g.patches[0].diff).toMatch(/^\+A content preview states the read time/m);
  expect(nodesOf(g.run, false).at(-1)?.state).toBe("waiting");

  const unreachable = await detail(ids.unreachable);
  expect(unreachable.run.standard.version, "an unresolved standard stays absent, never blank").toBeUndefined();
  expect(unreachable.run.error).toMatch(/^registry-unreachable:/);

  const list = (await (await listGET(at("/api/articles"))).json()) as RunList;
  expect(list.runs.map((r) => r.id)).toEqual(expect.arrayContaining(Object.values(ids)));
  expect(list.driving.sort()).toEqual([ids.drafting, ids.landing, ids.researching, ids["critique-running"]].sort());
  expect(list.damaged).toEqual([]);
});

test("case 2: the model — cost sums only what was reported, the check puts failures first, a fresh write is live", () => {
  const steps: ArticleRun["steps"] = [
    { name: "research", status: "done", startedAt: "t", endedAt: "t", costUsd: 1.25 },
    { name: "outline", status: "done", startedAt: "t", endedAt: "t" },
    { name: "draft", status: "running", startedAt: "t" },
  ];
  expect(costOf({ steps })).toEqual({ usd: 1.25, unpriced: 1 });
  expect(costOf({ steps: [] })).toEqual({ usd: null, unpriced: 0 });

  const report = {
    items: [
      { id: "a", dimension: "structure", label: "a", status: "pass" },
      { id: "b", dimension: "storytelling", label: "b", status: "not-measured" },
      { id: "c", dimension: "figures", label: "c", status: "fail" },
      { id: "d", dimension: "truth", label: "d", status: "fail" },
    ],
  } as Pick<CheckReport, "items">;
  expect(checkOrder(report).map((i) => i.id)).toEqual(["c", "d", "b", "a"]);

  const run = { status: "approved", updatedAt: "2026-10-05T10:00:00.000Z", steps: [] } as unknown as ArticleRun;
  const t = Date.parse(run.updatedAt);
  expect(liveOf({ run, driving: false }, t + 1000), "a route answers before launchRun takes the lease").toBe(true);
  expect(liveOf({ run, driving: false }, t + START_GRACE_MS + 1)).toBe(false);
  expect(phaseOf(run, false)).toBe("stalled");
  expect(phaseOf(run, true)).toBe("landing");
});

test("case 2b: the critique panel's reading of every critique state, through GET /api/articles/<id>", async () => {
  const gate = await toGate();
  const ids = seedRunStates(box.store, gate.id, { driverPid: process.pid });

  // running: two reviewers back; the two without a receipt read as reviewing
  // while the drive is live, and as not run when it is not
  const running = await detail(ids["critique-running"]);
  expect(running.driving).toBe(true);
  expect(nodesOf(running.run, true).map((n) => n.state)).toEqual(["done", "done", "done", "running", "pending", "pending"]);
  const live = reviewerRows(running.critique!, 1, true);
  expect(live.map((r) => `${r.spec.id}:${r.state}`)).toEqual(["fable:completed", "grok:reviewing", "gemini:reviewing", "gpt:completed"]);
  expect(reviewerRows(running.critique!, 1, false).map((r) => r.state)).toEqual(["completed", "not-run", "not-run", "completed"]);
  expect(roundTimeline(running.critique!)[0]).toMatchObject({ round: 1, completed: 2, of: 4, closed: false });
  expect(roundTimeline(running.critique!)[0].decision).toBeUndefined();
  // a round the writer has not answered: every finding is unanswered, never a made-up disposition
  expect(findingGroups(running.critique!.rounds[0]).flatMap((g) => g.rows).every((r) => r.disposition === undefined)).toBe(true);

  // partial: grok out of balance, visible with its error; the run reached the gate
  const partial = await detail(ids["critique-partial"]);
  const prow = reviewerRows(partial.critique!, 1, false);
  expect(prow.find((r) => r.spec.id === "grok")).toMatchObject({ state: "unavailable", error: expect.stringMatching(/402 Payment Required/) });
  expect(prow.find((r) => r.spec.id === "grok")?.counts, "no review, no counts").toBeUndefined();
  expect(partial.run.critique).toMatchObject({ rounds: 1, decision: "keep", findings: { total: 9, accepted: 3, rejected: 3, deferred: 3 } });
  expect(partial.run.critique?.reviewers.map((r) => r.outcome)).toEqual(["completed", "unavailable", "completed", "completed"]);

  // quorum: failed with the named error and every reviewer's reason
  const quorum = await detail(ids["critique-quorum"]);
  expect(phaseOf(quorum.run, false)).toBe("failed");
  expect(quorum.run.error).toMatch(/^critique: critique-quorum: round 1: 1 of 4/);
  expect(quorum.run.error).toMatch(/grok unavailable.*gemini seat-limit.*gpt timed-out/);
  expect(reviewerRows(quorum.critique!, 1, false).map((r) => r.state)).toEqual(["completed", "unavailable", "seat-limit", "timed-out"]);
  expect(nodesOf(quorum.run, false).map((n) => n.state)).toEqual(["done", "done", "done", "failed", "pending", "pending"]);

  // keep: one round, findings grouped by kind in the lenses' order, blockers first
  const keep = await detail(ids["critique-keep"]);
  const groups = findingGroups(keep.critique!.rounds[0]);
  expect(groups.map((g) => g.kind)).toEqual(["factual", "format", "insight"]);
  expect(groups[0].rows.every((r) => r.finding.severity === "blocker" && r.disposition?.disposition === "accepted")).toBe(true);
  expect(groups[0].rows[0].disposition?.action).toBe("Replace the price and date it.");
  expect(latestRound(keep.critique!)).toBe(1);

  // rewrite with two rounds: research then a rewrite, round 2 kept
  const rewrite = await detail(ids["critique-rewrite"]);
  const t = roundTimeline(rewrite.critique!);
  expect(t.map((l) => [l.round, l.decision?.decision, l.revised?.research ?? null])).toEqual([[1, "research", true], [2, "keep", null]]);
  expect(latestRound(rewrite.critique!)).toBe(2);
  expect(rewrite.run.critique).toMatchObject({ rounds: 2, decision: "keep" });
  expect(rewrite.run.critique?.findings.total).toBe(9 + 3);
  expect(countBySeverity(rewrite.critique!.rounds[1].reviews[0].findings)).toEqual({ blocker: 0, major: 0, minor: 1 });
  // cost only where the CLI reported one: the claude reviewer has it, codex and agy do not
  const cost = Object.fromEntries((rewrite.run.critique?.reviewers ?? []).map((r) => [r.id, r.costUsd]));
  expect(cost.fable).toBeGreaterThan(0);
  expect(cost.gpt).toBeUndefined();
  expect(cost.gemini).toBeUndefined();
});

/* ── the acts ─────────────────────────────────────────────────────────── */

test("case 3: approve — an unknown run is a 404 that leaves no directory; a bad body is a 400; the right one records approval and lands", async () => {
  process.env.STUB_GH_LOG = path.join(box.dir, "gh.log");
  const ghost = "2026-10-05-no-such-run";
  const r404 = await approvePOST(post(`/api/articles/${ghost}/approve`, { patches: [] }), ctx({ runId: ghost }));
  expect(r404.status).toBe(404);
  expect(((await r404.json()) as { code: string }).code).toBe("not-found");
  expect(existsSync(path.join(box.store, ghost)), "a 404 created a run directory").toBe(false);

  const gate = await toGate();
  const bad = await approvePOST(post(`/api/articles/${gate.id}/approve`, { patches: "p1" }), ctx({ runId: gate.id }));
  expect(bad.status).toBe(400);
  const unknown = await approvePOST(post(`/api/articles/${gate.id}/approve`, { patches: ["p9"] }), ctx({ runId: gate.id }));
  expect(unknown.status).toBe(400);
  expect((await readRun(gate.id)).status, "a refused approval wrote nothing").toBe("awaiting-approval");

  const ok = await approvePOST(post(`/api/articles/${gate.id}/approve`, { patches: ["p1"] }), ctx({ runId: gate.id }));
  expect(ok.status).toBe(200);
  const answered = ((await ok.json()) as { run: ArticleRun }).run;
  expect(answered.status).toBe("approved");
  expect(answered.approval?.patches).toEqual(["p1"]);

  const landed = await settle(gate.id, ["landed", "failed"]);
  expect(landed.status, landed.error).toBe("landed");
  expect(landed.approval?.patches).toEqual(["p1"]);
  expect(landed.landing?.prUrl).toBe("https://example.invalid/xkazm04/ai-registry/pull/1");
  expect(git(box.origin, "branch", "--list", "article/a-stub-post-about-tokens")).toContain("article/a-stub-post-about-tokens");
  expect(readFileSync(path.join(box.dir, "gh.log"), "utf8")).toContain('"pr","create"');

  const again = await approvePOST(post(`/api/articles/${gate.id}/approve`, { patches: [] }), ctx({ runId: gate.id }));
  expect(again.status, "a landed run cannot be approved twice").toBe(409);
});

test("case 4: reject — a note is required; the note is what the run keeps; a decided run refuses", async () => {
  const gate = await toGate();
  const empty = await rejectPOST(post(`/api/articles/${gate.id}/reject`, { note: "   " }), ctx({ runId: gate.id }));
  expect(empty.status).toBe(400);
  const ok = await rejectPOST(post(`/api/articles/${gate.id}/reject`, { note: "The counter-source is a news piece." }), ctx({ runId: gate.id }));
  expect(ok.status).toBe(200);
  const stored = await readRun(gate.id);
  expect(stored.status).toBe("rejected");
  expect(stored.rejection?.note).toBe("The counter-source is a news piece.");
  expect(stored.approval).toBeUndefined();
  const twice = await rejectPOST(post(`/api/articles/${gate.id}/reject`, { note: "again" }), ctx({ runId: gate.id }));
  expect(twice.status).toBe(409);
});

test("case 5: resume — a failed draft goes back to drafting and the launched drive reaches the gate again", async () => {
  const gate = await toGate();
  const ids = seedRunStates(box.store, gate.id);
  const res = await resumePOST(post(`/api/articles/${ids.failed}/resume`), ctx({ runId: ids.failed }));
  expect(res.status).toBe(200);
  const resumed = ((await res.json()) as { run: ArticleRun }).run;
  expect(resumed.status).toBe("drafting");
  expect(resumed.error).toBeUndefined();
  const back = await settle(ids.failed, ["awaiting-approval", "failed"]);
  expect(back.status, back.error).toBe("awaiting-approval");
  // research was not re-run: its seeded cost survives untouched
  expect(back.steps.find((s) => s.name === "research")?.costUsd).toBe(1.2431);

  const rejected = await resumePOST(post(`/api/articles/${ids.rejected}/resume`), ctx({ runId: ids.rejected }));
  expect(rejected.status, "a rejected run is terminal").toBe(409);
});

test("case 6: create — a malformed topic is refused before anything is written; a free topic starts and reaches the gate", async () => {
  for (const body of [{}, { topic: { kind: "free", text: "  " } }, { topic: { kind: "subject", bundle: "x" } }, { topic: { kind: "free", text: "t" }, effort: "huge" }]) {
    const r = await createPOST(post("/api/articles", body));
    expect(r.status, JSON.stringify(body)).toBe(400);
  }
  expect(((await (await listGET(at("/api/articles"))).json()) as RunList).runs, "a refused create wrote a run").toEqual([]);

  const r = await createPOST(post("/api/articles", { topic: { kind: "subject", bundle: "software-engineering", subject: "token-budgeting", angle: "who pays" }, effort: "low" }));
  expect(r.status).toBe(201);
  const run = ((await r.json()) as { run: ArticleRun }).run;
  expect(run.topic).toMatchObject({ kind: "subject", bundle: "software-engineering", subject: "token-budgeting", angle: "who pays", text: "Token budgeting" });
  expect(run.effort).toBe("low");
  const done = await settle(run.id, ["awaiting-approval", "failed"]);
  expect(done.status, done.error).toBe("awaiting-approval");
});

test("case 7: the file route serves the post under a no-network, no-script CSP, and nothing else in the run", async () => {
  const gate = await toGate();
  const get = (rel: string, k?: string) => fileGET(at(`/api/articles/${gate.id}/file/${rel}${k ? `?k=${k}` : ""}`), ctx({ runId: gate.id, path: rel.split("/") }));
  const page = await get("post/index.html");
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toMatch(/^text\/html/);
  expect(page.headers.get("content-security-policy")).toMatch(/default-src 'none'.*sandbox/);
  const fig = await get("post/figures/01-figure-1.svg");
  expect(fig.headers.get("content-type")).toBe("image/svg+xml");
  for (const rel of ["run.json", "post/../run.json", "agent/draft-prompt.md", "post/..\\run.json", "landing.log"]) {
    const r = await get(rel);
    expect(r.status, rel).toBe(404);
  }
  expect((await get("post/nothing.svg")).status).toBe(404);

  expect(carryKey('<img src="figures/a.svg"><a href="#src-1">x</a><a href="https://e.org/x">y</a><img src="/abs.png">', "s e")).toBe(
    '<img src="figures/a.svg?k=s%20e"><a href="#src-1">x</a><a href="https://e.org/x">y</a><img src="/abs.png">',
  );
});

test("case 8: every door is shut without access", async () => {
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  delete process.env[ACCESS_SECRET_VAR];
  const id = "2026-10-05-x";
  const shut = [
    await listGET(at("/api/articles")),
    await detailGET(at(`/api/articles/${id}`), ctx({ runId: id })),
    await rejectPOST(post(`/api/articles/${id}/reject`, { note: "n" }), ctx({ runId: id })),
    await fileGET(at(`/api/articles/${id}/file/post/index.html`), ctx({ runId: id, path: ["post", "index.html"] })),
  ];
  expect(shut.map((r) => r.status)).toEqual([401, 401, 401, 401]);
});

/* ── the Board's articles source ─────────────────────────────────────── */

/** `fetch` replaced by a dispatcher onto the real route handlers. */
function routeFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://studio.local");
    const req = new Request(url, init);
    const m = /^\/api\/articles(?:\/([^/]+))?(?:\/(approve|reject|resume))?$/.exec(url.pathname);
    if (!m) return new Response("not found", { status: 404 });
    const [, id, verb] = m;
    if (!id) return req.method === "POST" ? createPOST(req) : listGET(req);
    const c = ctx({ runId: decodeURIComponent(id) });
    if (verb === "approve") return approvePOST(req, c);
    if (verb === "reject") return rejectPOST(req, c);
    if (verb === "resume") return resumePOST(req, c);
    return detailGET(req, c);
  }) as typeof fetch;
}

test("case 9: Board — the gate's runs are the items; approve with patches and clear are refused by name; reject writes reasons as the note", async () => {
  const gate = await toGate();
  const ids = seedRunStates(box.store, gate.id);
  const realFetch = globalThis.fetch;
  globalThis.fetch = routeFetch();
  try {
    const src = makeArticlesSource();
    const count = await src.count();
    // at the gate: the template, the gate clone and the three critiqued gate
    // clones; decided: landing, landed, land-failed (approved), rejected. Not
    // items: anything before the gate (a critique quorum failure included).
    expect(count).toEqual({ total: 9, pending: 5, decided: 4, rejected: 1 });
    const entries = await src.loadEntries();
    expect(entries.map((e) => e.item.id).sort()).toEqual(
      [gate.id, ids.gate, ids["critique-partial"], ids["critique-keep"], ids["critique-rewrite"], ids.landing, ids.landed, ids["land-failed"], ids.rejected].map((id) => `articles:${id}`).sort(),
    );
    const pending = entries.find((e) => e.item.id === `articles:${ids.gate}`)!;
    expect(pending.item.verdict).toBe(null);
    expect(pending.item.title).toBe("A stub post about tokens");
    // storytelling and depth are listed as not measured, never folded into pass
    // (render is off here, so the rendered items are not measured either)
    const pick = /^check: 0 fail · (\d+) not measured · \d+ pass$/.exec(pending.item.machinePick ?? "");
    expect(pick, pending.item.machinePick ?? "no machine pick").not.toBeNull();
    expect(Number(pick![1])).toBeGreaterThanOrEqual(2);
    expect(pending.refuse.approve).toMatch(/^2 registry patches/);
    expect(pending.refuse.clear).toBe(ARTICLE_CLEAR_REFUSAL);
    expect(pending.href).toBe(`/articles/${ids.gate}`);
    expect(entries.find((e) => e.item.id === `articles:${ids.rejected}`)?.item.verdict).toBe("reject");
    expect(entries.find((e) => e.item.id === `articles:${ids["land-failed"]}`)?.item.verdict).toBe("approve");

    await expect(src.decide(`articles:${ids.gate}`, "approve")).rejects.toBeInstanceOf(VerdictRefused);
    await expect(src.decide(`articles:${ids.gate}`, null)).rejects.toThrow(ARTICLE_CLEAR_REFUSAL);
    await expect(src.decide(`articles:${ids.gate}`, "reject")).rejects.toThrow(ARTICLE_NOTE_REFUSAL);
    expect((await readRun(ids.gate)).status, "a refused verdict wrote nothing").toBe("awaiting-approval");

    await src.decide(`articles:${ids.gate}`, "reject", ["truth", "voice"]);
    const stored = await readRun(ids.gate);
    expect(stored.status).toBe("rejected");
    expect(stored.rejection?.note).toBe("reasons: truth, voice");

    // A run with no patches is approved from the Board, for real: it lands.
    writeFileSync(path.join(runDir(gate.id), "patches.json"), "[]\n");
    await src.decide(`articles:${gate.id}`, "approve");
    expect((await readRun(gate.id)).approval?.patches).toEqual([]);
    const landed = await settle(gate.id, ["landed", "failed"]);
    expect(landed.status, landed.error).toBe("landed");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("case 10: Board — a run before the gate is not an item, and the verdict is read off the status alone", () => {
  const base = { id: "r", topic: { kind: "free", text: "t" }, steps: [], model: "m", createdAt: "t" } as unknown as ArticleRun;
  for (const status of ["queued", "researching", "drafting", "critiquing", "checking"] as const) {
    expect(fromArticle({ status }), status).toBeUndefined();
    expect(articleEntry({ ...base, status }, null)).toBeNull();
  }
  expect(fromArticle({ status: "failed" }), "a failure before approval is not a verdict").toBeUndefined();
  expect(fromArticle({ status: "failed", approval: { at: "t", patches: [] } })).toBe("approve");
  expect(fromArticle({ status: "awaiting-approval" })).toBe(null);
  expect(fromArticle({ status: "rejected" })).toBe("reject");
  const e = articleEntry({ ...base, status: "awaiting-approval" }, null)!;
  expect(e.refuse.approve, "no detail read: no patch count to refuse on").toBeUndefined();
  expect(e.item.machinePick, "no check report: no machine pick, never a made-up one").toBeNull();
});
