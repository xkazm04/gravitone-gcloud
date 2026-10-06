// PUBLISH — the headless surface of the publishing engine (lib/publish/).
//
//   npx tsx pipeline/publish.mts channels                 # readiness per channel
//   npx tsx pipeline/publish.mts exports                  # what there is to publish
//   npx tsx pipeline/publish.mts list                     # the calendar (sweeps first)
//   npx tsx pipeline/publish.mts schedule --export <id> --channel youtube --at <ISO>
//        --title "..." [--description "..."] [--tags a,b] [--project <id>]
//   npx tsx pipeline/publish.mts tick [--now <ISO>]       # fire due slots, mark missed
//   npx tsx pipeline/publish.mts publish <slotId>         # publish one slot now
//   npx tsx pipeline/publish.mts reschedule <slotId> --at <ISO>
//   npx tsx pipeline/publish.mts cancel <slotId>
//   npx tsx pipeline/publish.mts metrics                  # refresh, then the totals
//
//   --json on any command: one JSON document on stdout, nothing else.
//   Exit 0 ok · 1 the operation failed (a refused schedule, a failed publish) · 2 usage.
//
// WHO THIS IS FOR. An LLM agent (or a cron line) driving the calendar without
// a browser. So the output is shaped for that reader: every command has a
// --json form whose keys are the HTTP contract's (lib/publish/types.ts), and
// a failure is an exit code plus `{ "error": "..." }`, never prose to parse.
//
// IT OWNS NO LOGIC. Every verb is one call into lib/publish — the same calls
// the app/api/publish routes make — so the CLI and the Calendar cannot
// disagree about what a slot is. `tick` is the only thing that fires slots;
// the routes never publish.
//
// DRY BY DEFAULT. PUBLISH_MODE unset = dry: a publish writes
// foundry-out/publish/plans/<slotId>.json and records `dry: true`. Nothing
// here contacts a platform unless PUBLISH_MODE=live AND the three YOUTUBE_*
// variables are set (lib/publish/channels.ts youtubeEffectiveMode).

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** .env then .env.local, never clobbering an exported value — the same loader
 *  pipeline/preflight.mts and verify-text-engine.mts use. */
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
const { channelReadiness } = await import("../lib/publish/channels");
const { listExports } = await import("../lib/publish/exports");
const { createSlot, listSlots, parseScheduleInput, updateSlot, cancelSlot, PublishError } = await import("../lib/publish/schedule");
const { tick, publishNow, refreshMetrics } = await import("../lib/publish/publisher");
const { readMetrics, readPublications, storeRoot } = await import("../lib/publish/store");
const { publicationTotals } = await import("../lib/publish/metrics");
type ScheduleSlot = import("../lib/publish/types").ScheduleSlot;

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
        "  schedule --export <id> --channel youtube --at <ISO> --title <t> [--description <d>] [--tags a,b] [--project <id>]\n" +
        "  tick [--now <ISO>]   publish <slotId>   reschedule <slotId> --at <ISO>   cancel <slotId>",
    );
  }
  process.exit(2);
}

function fail(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (JSON_OUT) console.log(JSON.stringify({ error: msg }));
  else console.error(`publish: ${msg}`);
  process.exit(e instanceof PublishError && e.status === 400 ? 2 : 1);
}

const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));
const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(v));

function printSlots(slots: ScheduleSlot[]) {
  if (!slots.length) return console.log("  (no slots)");
  for (const s of slots)
    console.log(
      `  ${pad(s.id, 12)} ${pad(s.status, 10)} ${pad(s.publishAt, 24)} ${pad(s.channelId, 9)} ${pad(s.exportId, 38)} ${pad(s.title, 30)}${s.error ? `  ! ${s.error}` : ""}`,
    );
}

async function main() {
  switch (cmd) {
    case "channels": {
      const r = channelReadiness();
      if (JSON_OUT) return out(r);
      console.log(`mode: ${r.mode}`);
      for (const c of r.channels) {
        console.log(`\n  ${pad(c.name, 10)} ${c.status}${c.note ? `  — ${c.note}` : ""}`);
        for (const e of c.env) console.log(`    env ${pad(e.name, 24)} ${e.present ? "set" : "unset"}`);
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
      const slots = await listSlots(now);
      if (JSON_OUT) return out({ slots, now: now.toISOString() });
      return printSlots(slots);
    }
    case "schedule": {
      const exportId = flag("export") ?? usage("--export is required");
      const exp = (await listExports()).find((e) => e.id === exportId);
      // the export may name its project in a sidecar; otherwise the caller must
      const projectId = flag("project") ?? exp?.projectId ?? usage("--project is required: this export carries no project id");
      const input = parseScheduleInput({
        projectId,
        exportId,
        channelId: flag("channel") ?? usage("--channel is required"),
        publishAt: flag("at") ?? usage("--at is required"),
        title: flag("title") ?? usage("--title is required"),
        description: flag("description") ?? "",
        tags: (flag("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      });
      const slot = await createSlot(input);
      if (JSON_OUT) return out({ slot });
      console.log(`scheduled ${slot.id} · ${slot.channelId} · ${slot.publishAt}`);
      return;
    }
    case "tick": {
      const at = flag("now");
      if (at && Number.isNaN(Date.parse(at))) usage(`--now is not a date: ${at}`);
      const r = await tick(at ? new Date(at) : new Date());
      if (JSON_OUT) out(r);
      else {
        console.log(`fired ${r.outcomes.length} · missed ${r.missed.length} · interrupted ${r.interrupted.length} · drifted ${r.drifted.length}`);
        for (const o of r.outcomes)
          console.log(`  ${o.slot.id} ${o.slot.status}${o.publication ? ` · ${o.publication.id}${o.publication.dry ? " (dry)" : ""}` : ""}${o.planFile ? ` · plan ${path.relative(ROOT, o.planFile)}` : ""}${o.slot.error ? `  ! ${o.slot.error}` : ""}`);
        for (const id of r.missed) console.log(`  ${id} missed`);
      }
      if (r.outcomes.some((o) => o.slot.status === "failed")) process.exit(1);
      return;
    }
    case "publish": {
      const id = args[1] && !args[1].startsWith("--") ? args[1] : usage("publish needs a slot id");
      const o = await publishNow(id);
      if (JSON_OUT) out(o);
      else
        console.log(
          `${o.slot.id} ${o.slot.status}${o.publication ? ` · ${o.publication.id}${o.publication.dry ? " (dry)" : ` · ${o.publication.platformVideoId}`}` : ""}${o.planFile ? ` · plan ${path.relative(ROOT, o.planFile)}` : ""}${o.slot.error ? `  ! ${o.slot.error}` : ""}`,
        );
      if (o.slot.status === "failed") process.exit(1);
      return;
    }
    case "reschedule": {
      const id = args[1] && !args[1].startsWith("--") ? args[1] : usage("reschedule needs a slot id");
      const slot = await updateSlot(id, { status: "scheduled", publishAt: flag("at") ?? usage("--at is required") });
      if (JSON_OUT) return out({ slot });
      return printSlots([slot]);
    }
    case "cancel": {
      const id = args[1] && !args[1].startsWith("--") ? args[1] : usage("cancel needs a slot id");
      const slot = await cancelSlot(id);
      if (JSON_OUT) return out({ slot });
      return printSlots([slot]);
    }
    case "metrics": {
      const refresh = await refreshMetrics();
      const [pubs, metrics] = await Promise.all([readPublications(), readMetrics()]);
      if (JSON_OUT) return out({ refresh, publications: pubs.publications, snapshots: metrics.snapshots });
      console.log(`refreshed ${refresh.refreshed}${refresh.note ? ` — ${refresh.note}` : ""}`);
      for (const p of pubs.publications) {
        const t = publicationTotals(p, metrics.snapshots);
        console.log(
          `  ${pad(p.id, 13)} ${pad(p.channelId, 9)} ${p.dry ? "DRY RUN " : "        "} ${pad(t.data, 10)} views ${pad(dash(t.totals.views), 8)} likes ${pad(dash(t.totals.likes), 6)} comments ${dash(t.totals.comments)}`,
        );
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
if (!JSON_OUT && cmd && ["list", "schedule", "tick", "publish"].includes(cmd)) console.error(`(store: ${path.relative(ROOT, storeRoot()) || "."})`);
