// THE STRIP RUN — author, lint, render and gate a set of approach cards, and leave
// <out>/strips/<run>/ ready for triage in /foundry (Strips tab).
// Plan: docs/code-rendered-strips-plan.md. Contract: pipeline/strips/CONTRACT.md.
//
//   npx tsx pipeline/strips/run.mts --controls-only                 # P2: one control per case
//   npx tsx pipeline/strips/run.mts --only E05,S06 --replicas E05,S06 # a pilot
//   npx tsx pipeline/strips/run.mts --lane all --replicas E02,E07,E13,E18,S02,S07,S13,S18 \
//        --effort-arm E10,S06,S19 --run strips-r1                   # the full round
//   ... --resume --run strips-r1                                    # continue after a crash or a stop
//   ... --status strips-r1 [--json]                                 # the run and its job
//   ... --regate --run strips-r1                                    # re-capture every authored card, no seat
//
// SINCE PHASE 4 (L33) A RUN IS A KERNEL JOB (lib/producers/strips.ts), the same job
// POST /api/foundry/strips enqueues and the worker drives: this CLI prints the receipt,
// confirms it itself, and drives the job here (or leaves it to the worker with --detach).
// Its spend behaviour is v1's: invoked, it runs LIVE - one author turn per card on the
// operator's Claude seat, plus fix and review turns, plus up to one supporting image per
// approach that declares one (imaging router, agy first). --dry runs the whole job on
// stand-ins (a placeholder page, no capture, nothing spent; the run is marked dry and can
// never be committed) - v1's --dry printed the card list, which is the receipt now.
// --budget-usd is the job's ceiling: the job stops before the turn that would cross it,
// and every writer turn is capped at what is left. --resume retries the run's job: no
// booked turn is bought again, and a page that landed is adopted, never re-authored.
// --concurrency is accepted and ignored: a job performs one step at a time.
//
// EXIT 0 done, enqueued or read · 1 failed, stopped, refused or interrupted · 2 usage.
// NOT A TEST and not in `npm run verify` — invoked live it spends the operator's seat.

import { pathToFileURL } from "node:url";
import { errorMessage } from "@gt/domain/errors";

type Io = { readonly env: Readonly<Record<string, string | undefined>>; readonly out: (s: string) => void; readonly err: (s: string) => void };

const USAGE = [
  "usage: npx tsx pipeline/strips/run.mts [--run <id>] [--lane edu|stat|all] [--only A,B] [--replicas A,B] [--effort-arm A,B] [--effort high]",
  "         [--rounds 2] [--controls | --controls-only] [--no-leonardo] [--no-review] [--author-timeout 75]",
  "         [--budget-usd N] [--dry] [--detach] [--json]",
  "       npx tsx pipeline/strips/run.mts --resume --run <id> [--budget-usd N] [--detach] [--json]",
  "       npx tsx pipeline/strips/run.mts --status <id> [--json]",
  "       npx tsx pipeline/strips/run.mts --regate --run <id>",
].join("\n");

class Usage extends Error {}

const SELECTION_FLAGS = ["lane", "only", "replicas", "effort-arm", "controls", "controls-only"];

export async function runCli(argv: readonly string[], io: Io): Promise<number> {
  const has = (k: string) => argv.includes(`--${k}`);
  const flag = (k: string): string | undefined => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const list = (k: string) => (flag(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const num = (k: string, d: number): number => {
    const v = flag(k);
    if (v === undefined) return d;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Usage(`--${k} needs a number, got "${v}"`);
    return n;
  };
  const json = has("json");
  const say = (s: string) => (json ? io.err(s) : io.out(s));
  const doc = (d: Record<string, unknown>) => io.out(JSON.stringify(d, null, 2));

  try {
    if (has("help")) {
      io.out(USAGE);
      return 0;
    }
    const lane = flag("lane") ?? "all";
    if (lane !== "edu" && lane !== "stat" && lane !== "all") throw new Usage(`--lane is edu, stat or all, not "${lane}"`);
    const budgetRaw = flag("budget-usd");
    const budget = budgetRaw === undefined ? undefined : num("budget-usd", 0);
    if (budget !== undefined && !(budget > 0)) throw new Usage("--budget-usd needs a positive number of dollars");
    if (has("concurrency")) say("--concurrency is ignored: a strip job performs one step at a time (lib/producers/strips.ts)");

    const S = await import("../../lib/producers/strips.ts");
    const { readStripRunNow, saveStripRun, stripRunDir } = await import("../../lib/foundry/strips/store.ts");
    const { DEFAULT_OPTIONS } = await import("../../lib/foundry/strips/cards.ts");
    const { ackLane, laneHold } = await import("@gt/kernel/job-queue");
    const { resume, retry } = await import("@gt/kernel/job");
    const { dryOnlyFrom } = await import("@gt/kernel/dryrun");
    const { parseAt } = await import("@gt/domain/door");
    const { jobIdSchema } = await import("@gt/domain/ids");

    const actor = { kind: "operator" as const, id: "cli" };
    const dryOnly = dryOnlyFrom(io.env);
    const k = S.stripsKernel();
    if (!k.ok) throw k.error;
    const store = k.value.store;
    const jid = (id: string) => {
      const p = parseAt("job id", jobIdSchema, id);
      if (!p.ok) throw p.error;
      return p.value;
    };

    const report = (runId: string, extra: Record<string, unknown> = {}, outcome?: string): number => {
      const m = readStripRunNow(runId);
      const job = m.job === undefined ? undefined : S.jobOf(store, m.job);
      const by = (s: string) => m.cards.filter((c) => c.status === s).length;
      const failed = job?.state === "failed" || job?.state === "interrupted" || outcome === "held" || outcome === "busy" || outcome === "unhealthy" || outcome === "error";
      const counts = { rendered: by("rendered"), pending: by("pending"), lintFailed: by("lint-failed"), renderFailed: by("render-failed"), authorFailed: by("author-failed") };
      if (json) {
        doc({
          ok: !failed,
          runId,
          ...(m.job === undefined ? {} : { jobId: m.job }),
          ...(outcome === undefined ? {} : { outcome }),
          job: job === undefined ? null : { state: job.state, attempt: job.attempt, mode: job.mode.kind, spend: job.spend, progress: job.progress, ...(job.ceilingUsd === undefined ? {} : { ceilingUsd: job.ceilingUsd }), ...(job.error === undefined ? {} : { error: job.error }), ...(job.interruption === undefined ? {} : { interruption: job.interruption }) },
          run: { status: m.status, dry: m.dry === true, cards: m.cards.length, ...counts, ...(m.error === undefined ? {} : { error: m.error }) },
          ...extra,
        });
      } else {
        if (job !== undefined) io.out(`job ${job.id} · ${job.state} · attempt ${job.attempt} · ${job.mode.kind} · $${job.spend.usd}${job.spend.unpriced ? ` (${job.spend.unpriced} unpriced)` : ""}${job.error ? ` · ${job.error.message}` : ""}`);
        io.out(`run ${runId} · ${m.status}${m.dry ? " (dry)" : ""}: rendered ${counts.rendered}, lint-failed ${counts.lintFailed}, render-failed ${counts.renderFailed}, author-failed ${counts.authorFailed}, pending ${counts.pending}`);
        if (m.status === "awaiting-triage" && !m.dry) io.out(`triage: /foundry -> Strips -> ${runId}`);
      }
      return failed ? 1 : 0;
    };

    const drive = async (runId: string, jobId: string): Promise<number> => {
      if (has("detach")) {
        say(`enqueued ${jobId}; the worker drives it`);
        return report(runId, { detached: true });
      }
      const t0 = Date.now();
      const r = await S.driveStrips(jobId, { dryOnly, onStep: (s) => say(`  ${Math.round((Date.now() - t0) / 1000)}s  ${s}`) });
      if (!r.ok) {
        say(`stopped: ${r.error.message}`);
        report(runId, { error: r.error.message }, "error");
        return 1;
      }
      if (r.value.reason !== undefined) say(r.value.reason);
      return report(runId, { wouldCalls: r.value.wouldCalls?.length ?? 0 }, r.value.outcome);
    };

    if (has("status")) {
      const id = flag("status");
      if (!id) throw new Usage("--status needs a run id");
      report(id);
      return 0;
    }

    const runId = flag("run");
    if (has("regate")) {
      if (!runId) throw new Usage("--regate needs --run <id>");
      return await regate(runId, io, { readStripRunNow, saveStripRun, stripRunDir, jobOf: (id) => S.jobOf(store, id) });
    }

    const selection = {
      lane,
      only: list("only"),
      replicas: list("replicas"),
      effortArm: list("effort-arm"),
      effort: flag("effort") ?? "high",
      controls: has("controls"),
      controlsOnly: has("controls-only"),
    } as const;
    const options = {
      rounds: Math.max(0, num("rounds", DEFAULT_OPTIONS.rounds)),
      review: !has("no-review"),
      leonardo: !has("no-leonardo"),
      authorTimeoutMin: num("author-timeout", DEFAULT_OPTIONS.authorTimeoutMin),
    };
    const mode = has("dry") ? ("dry" as const) : ("live" as const);

    if (has("resume")) {
      if (!runId) throw new Usage("--resume needs --run <id>");
      const m = readStripRunNow(runId);
      const job = m.job === undefined ? undefined : S.jobOf(store, m.job);
      if (job?.state === "running") throw new Error(`${runId} is being driven by job ${job.id} right now (${job.lease?.holder.host}/${job.lease?.holder.pid}); wait for it.`);
      if (job?.state === "failed" || job?.state === "interrupted") {
        // The hold this job left is the operator's to lift - and the operator just asked to retry it.
        const held = store.read((r) => laneHold(r, "seat.text"));
        if (held.ok && held.value?.jobId === job.id) {
          const a = ackLane(store, "seat.text", actor);
          if (!a.ok) throw a.error;
        }
        const r = retry(store, jid(job.id), actor, budget === undefined ? {} : { ceilingUsd: budget });
        if (!r.ok) throw r.error;
        say(`retried ${job.id} (attempt ${r.value.attempt})`);
        return drive(runId, job.id);
      }
      if (job?.state === "paused") {
        const r = resume(store, jid(job.id), actor);
        if (!r.ok) throw r.error;
        return drive(runId, job.id);
      }
      if (job?.state === "queued") return drive(runId, job.id);
      const add = SELECTION_FLAGS.some(has) ? selection : undefined;
      return launch({ kind: "run", runId, ...(add === undefined ? {} : { add }) });
    }

    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1-$2");
    return await launch({ kind: "new", runId: runId ?? `strips-${stamp}`, selection, options });

    async function launch(target: Parameters<typeof S.launchStrips>[0]): Promise<number> {
      const base = { mode, actor, dryOnly, ...(budget === undefined ? {} : { ceilingUsd: budget }) };
      const r0 = await S.launchStrips(target, base);
      if (!r0.ok) throw r0.error;
      if (r0.value.kind === "existing") return drive(r0.value.runId, r0.value.jobId);
      if (r0.value.kind !== "receipt") throw new Error(`unexpected ${r0.value.kind}`);
      const rc = r0.value.receipt;
      say(`receipt · ${mode} · ${r0.value.cards.length} card(s) · worst case $${rc.totals.usd} · eta ${rc.etaAt}${rc.ceilingUsd === undefined ? "" : ` · ceiling $${rc.ceilingUsd}${rc.overCeiling ? " (may stop at ceiling)" : ""}`}`);
      for (const c of r0.value.cards) say(`  ${c}`);
      let token = rc.token;
      for (let attempt = 0; attempt < 2; attempt++) {
        const r1 = await S.launchStrips(target, { ...base, token });
        if (!r1.ok) throw r1.error;
        if (r1.value.kind === "stale") {
          token = r1.value.fresh.token;
          continue;
        }
        if (r1.value.kind === "existing") return drive(r1.value.runId, r1.value.jobId);
        if (r1.value.kind !== "launched") throw new Error(`unexpected ${r1.value.kind}`);
        say(`launched ${r1.value.jobId}`);
        return drive(r1.value.runId, r1.value.jobId);
      }
      throw new Error("the receipt went stale twice; run the command again");
    }
  } catch (e) {
    const usage = e instanceof Usage;
    const message = errorMessage(e);
    if (json) io.out(JSON.stringify({ ok: false, error: message, ...(usage ? { usage: true } : {}) }, null, 2));
    else io.err(usage ? `${message}\n${USAGE}` : message);
    return usage ? 2 : 1;
  }
}

type RegateDeps = {
  readStripRunNow: typeof import("../../lib/foundry/strips/store.ts").readStripRunNow;
  saveStripRun: typeof import("../../lib/foundry/strips/store.ts").saveStripRun;
  stripRunDir: typeof import("../../lib/foundry/strips/store.ts").stripRunDir;
  jobOf: (id: string) => { readonly state: string; readonly id: string } | undefined;
};

/** Re-render and re-gate every authored card, with no authoring turn (v1 `--regate`). Free; refused while a job drives the run. */
async function regate(runId: string, io: Io, d: RegateDeps): Promise<number> {
  const { existsSync } = await import("node:fs");
  const { writeFile } = await import("node:fs/promises");
  const path = (await import("node:path")).default;
  const m = d.readStripRunNow(runId);
  const job = m.job === undefined ? undefined : d.jobOf(m.job);
  if (job !== undefined && ["queued", "running", "paused"].includes(job.state)) throw new Error(`${runId} is held by job ${job.id} (${job.state}); a regate would race it`);
  const { launchHeadless, renderStrip } = await import("./render.mts");
  const dir = d.stripRunDir(runId);
  const browser = await launchHeadless();
  try {
    for (const card of m.cards) {
      const html = path.join(dir, card.id, "strip.html");
      if (!existsSync(html) || card.status === "lint-failed" || card.status === "author-failed") continue;
      const r = await renderStrip({ browser, htmlPath: html, outDir: path.join(dir, card.id), lane: card.lane });
      card.gates = r.gates;
      card.error = r.error;
      card.status = r.ok ? "rendered" : "render-failed";
      card.renderMs = r.renderMs;
      card.files = { ...card.files, ...r.files };
      await writeFile(path.join(dir, card.id, "meta.json"), JSON.stringify(card, null, 2));
      const g = r.gates;
      io.out(`[${card.id}] regated ${card.status}${g ? ` seek:${g.seek.ok ? "ok" : "X"} legibility:${g.legibility.ok ? "ok" : "X"} motion:${g.motion.ok ? "ok" : "X"}` : ""}`);
    }
    await d.saveStripRun(m);
  } finally {
    await browser.close();
  }
  return 0;
}

/** v1's .env.local reader: the seat and the image router read their keys from the process. */
async function loadEnv(file = ".env.local"): Promise<void> {
  const { existsSync, readFileSync } = await import("node:fs");
  const p = (await import("node:path")).join(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = (m[2] ?? "").trim().replace(/^["']|["']$/g, "");
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await loadEnv();
  process.exitCode = await runCli(process.argv.slice(2), {
    env: process.env,
    out: (s) => void process.stdout.write(`${s}\n`),
    err: (s) => void process.stderr.write(`${s}\n`),
  });
}
