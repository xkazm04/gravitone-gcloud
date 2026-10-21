// PUBLISH — the headless surface of the calendar (the kernel's slots, @gt/kernel/slots, and the
// publish producer, @gt/producers/publish, bound by lib/producers/publish.ts).
//
//   npx tsx pipeline/publish.mts channels                 # readiness per channel, and its standing
//   npx tsx pipeline/publish.mts exports                  # what there is to publish
//   npx tsx pipeline/publish.mts list                     # the calendar (a read: never sweeps)
//   npx tsx pipeline/publish.mts schedule --export <id> --channel youtube --at <ISO>
//        --title "..." [--description "..."] [--tags a,b] [--part <partId>] [--project <id>]
//   npx tsx pipeline/publish.mts tick [--now <ISO>]       # fire due slots, mark missed (one tick)
//   npx tsx pipeline/publish.mts publish <slotId>         # publish one slot now
//   npx tsx pipeline/publish.mts reschedule <slotId> --at <ISO>
//   npx tsx pipeline/publish.mts cancel <slotId>
//   npx tsx pipeline/publish.mts metrics                  # refresh, then the totals
//
//   --json on any command: one JSON document on stdout, nothing else.
//   Exit 0 ok · 1 the operation failed (a refused schedule, a failed publish) · 2 usage.
//
// THE CONTRACT IS v1's (plan §5.1): the same verbs, the same `--json` keys - a slot is still
// `{ id, exportId, channelId, publishAt, status, error, missedAt, publicationId, ... }`, mapped
// once from the kernel record (@gt/producers/publish/wire) with the new facts added beside the old
// keys - and the same exit codes. What moved underneath: the calendar is the kernel store
// (GRAVITONE_STORE_PATH, else <foundry-out|fixtures-out>/gravitone.sqlite), so this CLI and the
// worker's `publish-tick` timer write one calendar under one transaction discipline, and `tick`
// here is the very function the timer runs (one tick, in this process).
//
// Upgraded from v1: `list` READS. v1's listSlots swept first, so looking at the calendar could
// mark slots missed and fail claims ("a GET writes"); here only `tick` and `publish` sweep.
// `--project` is accepted and no longer required: a slot names its Library item (and, from a
// plan, its part with `--part`), not a project.
//
// DRY BY DEFAULT. PUBLISH_MODE unset = dry: a publish keeps its plan as a blob (its path is
// `planFile`), records `dry: true`, and books a would-call on the ledger. Nothing here contacts a
// platform unless PUBLISH_MODE=live AND the three YOUTUBE_* variables are set AND the process is
// not GRAVITONE_DRY_ONLY=1.

// Runs under plain `node` too (`node pipeline/publish.mts ...`): the hooks give this process what
// Next gives the server - `@/` paths, bare .ts imports, `server-only` - as pipeline/ledger-sync.mts
// explains; `npx tsx` keeps working for the callers that spell it so.
import "./lib-hooks.mts";

import fs from "node:fs";
import { userInfo } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** .env then .env.local, never clobbering an exported value — the loader the other CLIs use. */
function loadEnv(root: string) {
  for (const f of [".env", ".env.local"]) {
    const at = path.join(root, f);
    if (!fs.existsSync(at)) continue;
    for (const line of fs.readFileSync(at, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (v && process.env[k] === undefined) process.env[k] = v;
    }
  }
}
loadEnv(ROOT);
// the store and export roots are cwd-relative (as in the server); pin them to the repo
process.chdir(ROOT);

// imported after loadEnv, so a module that reads env at load sees the operator's
const { channelReadiness, missedWindowMs } = await import("../lib/publish/channels.ts");
const { listExports } = await import("../lib/publish/exports.ts");
const { snippetProblem } = await import("../lib/publish/youtube.ts");
const { kernel, closeKernel, storeLocation } = await import("../lib/kernelProcess.ts");
const { publishDeps } = await import("../lib/producers/publish.ts");
const { publishTick, publishSlotNow } = await import("@gt/producers/publish/tick");
const { refreshMetrics } = await import("@gt/producers/publish/metrics");
const { standingIn } = await import("@gt/producers/publish/standing");
const { wireSlot, wirePublication } = await import("@gt/producers/publish/wire");
const { cancelSlot, createSlot, moveSlot } = await import("@gt/kernel/slots/write");
const { getSlot, listPublicationsIn, listSlotsIn, snapshotsIn } = await import("@gt/kernel/slots/read");
const { AppError, errorMessage, isAppError } = await import("@gt/domain/errors");
const { channelSchema, slotItemId } = await import("@gt/domain/slot");
const { publicationTotals } = await import("@gt/domain/publication");
type Result<T> = import("@gt/domain/errors").Result<T>;
type PublishOutcome = import("@gt/producers/publish/publish").PublishOutcome;
type WireSlot = import("@gt/producers/publish/wire").WireSlot;
type Store = import("@gt/kernel/store").Store;

const ACTOR = { kind: "operator", id: userInfo().username || "operator" } as const;

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const args = argv.filter((a) => a !== "--json");
const cmd = args[0];

function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) usage(`--${name} needs a value`);
  return v;
}

function usage(msg?: string): never {
  if (JSON_OUT) console.log(JSON.stringify({ error: msg ?? "usage" }));
  else {
    if (msg) console.error(`publish: ${msg}\n`);
    console.error(
      "usage: npx tsx pipeline/publish.mts <channels|exports|list|schedule|tick|publish|reschedule|cancel|metrics> [--json]\n" +
        "  schedule --export <id> --channel youtube --at <ISO> --title <t> [--description <d>] [--tags a,b] [--part <partId>]\n" +
        "  tick [--now <ISO>]   publish <slotId>   reschedule <slotId> --at <ISO>   cancel <slotId>",
    );
  }
  closeKernel();
  process.exit(2);
}

/** A refusal: `invalid` is the caller's input (exit 2, v1's 400), anything else the operation (1). */
function fail(e: unknown): never {
  const msg = errorMessage(e);
  if (JSON_OUT) console.log(JSON.stringify({ error: msg }));
  else console.error(`publish: ${msg}`);
  closeKernel();
  process.exit(isAppError(e) && e.code === "invalid" ? 2 : 1);
}

const must = <T,>(r: Result<T>): T => (r.ok ? r.value : fail(r.error));
const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));
const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(v));
const isoAt = (raw: string, what: string): string => (Number.isNaN(Date.parse(raw)) ? usage(`${what} is not a date: ${raw}`) : new Date(raw).toISOString());
const slotArg = (verb: string): string => (args[1] && !args[1].startsWith("--") ? args[1] : usage(`${verb} needs a slot id`));

function printSlots(slots: readonly WireSlot[]) {
  if (!slots.length) return console.log("  (no slots)");
  for (const s of slots)
    console.log(
      `  ${pad(s.id, 12)} ${pad(s.status, 10)} ${pad(s.publishAt, 24)} ${pad(s.channelId, 9)} ${pad(s.exportId ?? s.libraryItemId, 38)} ${pad(s.title, 30)}${s.error ? `  ! ${s.error}` : ""}`,
    );
}

function store(): Store {
  return must(kernel()).store;
}

/** An outcome as v1's `{ slot, publication, planFile }`, read back from the store. */
function wireOutcome(s: Store, o: PublishOutcome) {
  const slot = wireSlot(must(getSlot(s, o.slotId)));
  const pub = o.kind === "published" ? wirePublication(o.publication) : null;
  return { slot, publication: pub, planFile: o.kind === "published" ? (o.plan?.file ?? null) : null, ...(o.kind === "lost" ? { lost: o.error } : {}) };
}

function outcomeLine(o: ReturnType<typeof wireOutcome>): string {
  const p = o.publication;
  return `  ${o.slot.id} ${o.slot.status}${p ? ` · ${p.id}${p.dry ? " (dry)" : ` · ${p.platformVideoId}`}` : ""}${o.planFile ? ` · plan ${path.relative(ROOT, o.planFile)}` : ""}${o.slot.error ? `  ! ${o.slot.error}` : ""}${o.lost ? `  ! ${o.lost}` : ""}`;
}

async function main() {
  switch (cmd) {
    case "channels": {
      const r = channelReadiness();
      const s = store();
      const standing = must(s.read((rd) => r.channels.map((c) => standingIn(rd, c.id))));
      const channels = r.channels.map((c, i) => ({ ...c, standing: standing[i] }));
      if (JSON_OUT) return out({ mode: r.mode, channels });
      console.log(`mode: ${r.mode}`);
      for (const c of channels) {
        console.log(`\n  ${pad(c.name, 10)} ${c.status}${c.note ? `  — ${c.note}` : ""}`);
        for (const e of c.env) console.log(`    env ${pad(e.name, 24)} ${e.present ? "set" : "unset"}`);
        const st = c.standing;
        if (st && st.attempts > 0) console.log(`    last ok ${dash(st.lastSuccessAt)} · ${st.failuresSinceSuccess} failure(s) since${st.lastError ? `  ! ${st.lastError}` : ""}`);
      }
      const cli = r.channels[0]?.cli ?? [];
      console.log(`\n  cli ${cli.map((c) => `${c.name}:${c.present ? "on PATH" : c.forbidden ? "forbidden here" : "missing"}`).join("  ")}`);
      return;
    }
    case "exports": {
      const exports = await listExports();
      if (JSON_OUT) return out({ exports });
      if (!exports.length) return console.log("  (no exports)");
      for (const e of exports) console.log(`  ${pad(e.id, 38)} ${pad(String(e.bytes), 12)} ${pad(e.createdAt, 26)} project ${dash(e.projectId)}`);
      return;
    }
    case "list": {
      const now = new Date();
      const slots = must(store().read((rd) => listSlotsIn(rd))).map(wireSlot);
      if (JSON_OUT) return out({ slots, now: now.toISOString() });
      return printSlots(slots);
    }
    case "schedule": {
      const exportId = flag("export") ?? usage("--export is required");
      const channel = channelSchema.safeParse(flag("channel") ?? usage("--channel is required"));
      if (!channel.success) usage(`--channel must be one of ${channelSchema.options.join(", ")}`);
      const at = isoAt(flag("at") ?? usage("--at is required"), "--at");
      const title = (flag("title") ?? usage("--title is required")).trim();
      const description = flag("description") ?? "";
      const tags = (flag("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
      const part = flag("part");
      flag("project"); // v1's, accepted for the callers that still pass it
      // the platform's own limits, checked when the slot is made rather than when it fires at 3 a.m.
      const problem = channel.data === "blog" ? null : snippetProblem({ title, description, tags });
      if (problem) fail(new AppError("invalid", problem));
      const s = store();
      const deps = must(publishDeps({ store: s }));
      const ready = must(await deps.facts(Date.now()));
      const row = must(createSlot(s, { libraryItemId: slotItemId.export(exportId), channel: channel.data, at, title, description, tags, ...(part === undefined ? {} : { partId: part }) }, ACTOR, ready));
      const slot = wireSlot(row);
      if (JSON_OUT) return out({ slot });
      console.log(`scheduled ${slot.id} · ${slot.channelId} · ${slot.publishAt}`);
      return;
    }
    case "tick": {
      const raw = flag("now");
      const now = raw === undefined ? new Date() : new Date(isoAt(raw, "--now"));
      const s = store();
      const r = must(await publishTick(must(publishDeps({ store: s })), now));
      const outcomes = r.outcomes.map((o) => wireOutcome(s, o));
      if (JSON_OUT) out({ missed: r.missed, interrupted: r.interrupted, drifted: r.drifted, cleared: r.cleared, outcomes });
      else {
        console.log(`fired ${outcomes.length} · missed ${r.missed.length} · interrupted ${r.interrupted.length} · drifted ${r.drifted.length}`);
        for (const o of outcomes) console.log(outcomeLine(o));
        for (const id of r.missed) console.log(`  ${id} missed`);
      }
      if (r.outcomes.some((o) => o.kind !== "published")) {
        closeKernel();
        process.exit(1);
      }
      return;
    }
    case "publish": {
      const id = slotArg("publish");
      const s = store();
      const o = wireOutcome(s, must(await publishSlotNow(must(publishDeps({ store: s })), id, new Date())));
      if (JSON_OUT) out(o);
      else console.log(outcomeLine(o).trim());
      if (o.slot.status !== "published") {
        closeKernel();
        process.exit(1);
      }
      return;
    }
    case "reschedule": {
      const id = slotArg("reschedule");
      const at = isoAt(flag("at") ?? usage("--at is required"), "--at");
      const slot = wireSlot(must(moveSlot(store(), id, at, ACTOR, { now: Date.now(), windowMs: missedWindowMs() })));
      if (JSON_OUT) return out({ slot });
      return printSlots([slot]);
    }
    case "cancel": {
      const slot = wireSlot(must(cancelSlot(store(), slotArg("cancel"), ACTOR)));
      if (JSON_OUT) return out({ slot });
      return printSlots([slot]);
    }
    case "metrics": {
      const s = store();
      const refresh = must(await refreshMetrics(must(publishDeps({ store: s })), new Date()));
      const { pubs, snaps } = must(s.read((rd) => ({ pubs: listPublicationsIn(rd), snaps: snapshotsIn(rd) })));
      if (JSON_OUT) return out({ refresh, publications: pubs.map(wirePublication), snapshots: snaps });
      console.log(`refreshed ${refresh.refreshed}${refresh.note ? ` — ${refresh.note}` : ""}`);
      for (const p of pubs) {
        const t = publicationTotals(p, snaps);
        console.log(`  ${pad(p.id, 13)} ${pad(p.channel, 9)} ${p.dry ? "DRY RUN " : "        "} ${pad(t.data, 10)} views ${pad(dash(t.totals.views), 8)} likes ${pad(dash(t.totals.likes), 6)} comments ${dash(t.totals.comments)}`);
      }
      return;
    }
    default:
      usage(cmd ? `unknown command: ${cmd}` : undefined);
  }
}

try {
  await main();
} catch (e) {
  fail(e);
}
if (!JSON_OUT && cmd && ["list", "schedule", "tick", "publish"].includes(cmd)) {
  const rel = path.relative(ROOT, storeLocation());
  console.error(`(store: ${rel === "" || rel.startsWith("..") ? storeLocation() : rel})`);
}
closeKernel();
