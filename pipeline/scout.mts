// SCOUT - the night's CLI (spark media-training-loop). The /scout skill drives it;
// an operator may type any line of it. Docs: docs/scout.md.
//
//   npx tsx pipeline/scout.mts doctor [--dry] [--json]
//   npx tsx pipeline/scout.mts open [--ceiling 15] [--target 20] [--clips 2] [--assets 3] [--until HH:MM] [--live] [--json]
//   npx tsx pipeline/scout.mts add-source <night> --json <file|->
//   npx tsx pipeline/scout.mts ingest <night> [--source s-NN] [--detach]
//   npx tsx pipeline/scout.mts style <night> --sources s-01,s-03 --use "<content it serves>" [--slug x] [--detach]
//   npx tsx pipeline/scout.mts scene <night> --source s-NN --use "<content it serves>" [--frames k-012.jpg] [--detach]
//   npx tsx pipeline/scout.mts asset <night> --brief <file|-> [--detach]
//   npx tsx pipeline/scout.mts finding <night> --json <file|->
//   npx tsx pipeline/scout.mts watch <night> --entry "..." --why "..." [--sources s-01,s-02]
//   npx tsx pipeline/scout.mts close <night> [--stop <reason>]
//   npx tsx pipeline/scout.mts status [<night>] [--json]
//   npx tsx pipeline/scout.mts folder <dir> [pipeline/foundry/extract.mts args]
//
// THE MONEY. A night is DRY unless it was opened with --live (refused under
// GRAVITONE_DRY_ONLY=1), and every launch from it inherits its mode: a dry night's
// jobs answer every paid call with a stand-in. Every launch's job ceiling is what
// the night has left (lib/foundry/scout/budget.ts); a launch whose worst case is
// over that, a launch from a closed night, and a launch after the deadline (which
// closes the night, `stop: deadline`) are refused with the numbers. Ingest is free.
//
// --json: one JSON document on stdout, progress on stderr. Under add-source and
// finding, `--json <file|->` names the INPUT, and the output is JSON as well.
// EXIT 0 done · 1 failed or refused · 2 usage. Never touches foundry-out/ when
// GRAVITONE_STORE_PATH and SCOUT_STORE_DIR point elsewhere.

import { USE_MAX } from "../lib/foundry/scout/types.ts";
import type { KeyFetch } from "../lib/imaging/keyProbe.ts";
import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { errorMessage } from "@gt/domain/errors";

import { DEFAULT_ASSET_CAP, DEFAULT_CEILING_USD, DEFAULT_CLIP_CAP, DEFAULT_TARGET } from "../lib/foundry/scout/types.ts";

type IngestDeps = import("../lib/foundry/scout/ingest.ts").IngestDeps;
type Spawn = import("../lib/foundry/scout/ingest.ts").Spawn;
type Resolver = import("../lib/imaging/safeUrl.ts").Resolver;
type AssetEngines = import("../lib/producers/scoutAssetActs.ts").AssetEngines;

/** What a test or a rehearsal injects; production passes none. */
export type CliPorts = {
  readonly ingest?: IngestDeps;
  readonly resolve?: Resolver;
  readonly spawn?: Spawn;
  readonly now?: () => Date;
  readonly stdin?: () => Promise<string>;
  /** `folder`'s child: the command and its args, the child's exit code back. */
  readonly run?: (cmd: string, args: readonly string[]) => Promise<number>;
  /** doctor's vendor key probes (lib/imaging/keyProbe.ts); a test hands a fake. */
  readonly keyFetch?: KeyFetch;
  /** `asset`'s concept vendor and input-gate decoder; a test hands fakes. */
  readonly asset?: Partial<AssetEngines>;
};
export type Io = { readonly env: Readonly<Record<string, string | undefined>>; readonly out: (s: string) => void; readonly err: (s: string) => void; readonly ports?: CliPorts };

const ROOT = path.resolve(import.meta.dirname, "..");
const USAGE = [
  "usage: npx tsx pipeline/scout.mts <command> [--json]",
  "  doctor [--dry]                              the box, the keys, the store",
  "  open [--ceiling 15] [--target 20] [--clips 2] [--assets 3] [--until HH:MM] [--live]",
  "  add-source <night> --json <file|->         [{url, kind, title, channel?, why, found, watch?}]",
  "  ingest <night> [--source s-NN] [--detach]",
  "  style <night> --sources s-01,s-03 --use \"<content>\" [--slug x] [--detach]",
  "  scene <night> --source s-NN --use \"<content>\" [--frames k-012.jpg] [--detach]",
  "  asset <night> --brief <file|-> [--detach]  {class, subject, use, style?, kind?, techniques?}",
  "  finding <night> --json <file|->            [{sourceIds, template, step, claim, quote}]",
  '  watch <night> --entry "..." --why "..." [--sources s-01]',
  "  close <night> [--stop deadline|budget|target|failure|sources-exhausted|operator]",
  "  status [<night>]",
  "  folder <dir> [pipeline/foundry/extract.mts args]",
].join("\n");

class Usage extends Error {}
/** A refusal the CLI makes itself; the acts' `Refusal` exits the same way. */
class Refused extends Error {}
const COMMANDS = new Set(["doctor", "open", "add-source", "ingest", "style", "scene", "asset", "finding", "watch", "close", "status"]);
const BOOL = new Set(["json", "live", "detach", "dry", "help", "retry"]);

/** argv -> positionals and flags. `--json` takes a value (the input file, or `-`) only under add-source and finding. */
function parse(argv: readonly string[]): { pos: string[]; flags: Map<string, string | true> } {
  const pos: string[] = [];
  const flags = new Map<string, string | true>();
  const cmd = argv.find((a) => !a.startsWith("--"));
  const reads = cmd === "add-source" || cmd === "finding";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const name = a.slice(2);
    const v = argv[i + 1];
    const takes = name === "json" ? reads : !BOOL.has(name);
    if (takes && v !== undefined && (v === "-" || !v.startsWith("--"))) {
      flags.set(name, v);
      i++;
    } else flags.set(name, true);
  }
  return { pos, flags };
}

/** `--until 06:30`: that time today, local, else tomorrow when it has passed. */
export function deadlineOf(hhmm: string, now: Date): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (m === null || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Usage(`--until wants HH:MM, got "${hhmm}"`);
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export async function runCli(argv: readonly string[], io: Io): Promise<number> {
  const { pos, flags } = parse(argv);
  const cmd = pos[0];
  const json = flags.has("json");
  const say = (s: string): void => (json ? io.err(s) : io.out(s));
  const doc = (d: Record<string, unknown>): void => io.out(JSON.stringify(d, null, 2));
  const str = (name: string): string | undefined => {
    const v = flags.get(name);
    if (v === true) throw new Usage(`--${name} needs a value`);
    return v;
  };
  const num = (name: string, d: number): number => {
    const v = str(name);
    if (v === undefined) return d;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Usage(`--${name} needs a positive number, got "${v}"`);
    return n;
  };
  const list = (name: string): string[] => (str(name) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const nightArg = (): string => {
    const n = pos[1];
    if (n === undefined) throw new Usage(`${cmd ?? "?"} needs a night id`);
    return n;
  };
  const input = async (flag = "json"): Promise<unknown> => {
    const src = flags.get(flag);
    if (typeof src !== "string") throw new Usage(`${cmd ?? "?"} reads its input from --${flag} <file|->`);
    const text = src === "-" ? await (io.ports?.stdin ?? readStdin)() : fs.readFileSync(path.resolve(src), "utf8");
    try {
      return JSON.parse(text) as unknown;
    } catch (e) {
      throw new Usage(`--${flag} ${src} is not JSON: ${errorMessage(e)}`);
    }
  };
  const now = (): Date => io.ports?.now?.() ?? new Date();

  try {
    // Everything after `folder` is extract's, --help and --json included.
    if (cmd === "folder") {
      const rest = argv.slice(argv.indexOf("folder") + 1);
      if (rest.length === 0) throw new Usage("folder needs a directory");
      const run = io.ports?.run ?? runInherited;
      // `npx tsx pipeline/foundry/extract.mts ...` without a second npx: this process's own
      // runtime and loader flags (tsx registers itself in execArgv), so no shell is spawned.
      return await run(process.execPath, [...process.execArgv, path.join(ROOT, "pipeline", "foundry", "extract.mts"), ...rest]);
    }

    if (cmd === undefined || flags.has("help")) {
      io.out(USAGE);
      return cmd === undefined ? 2 : 0;
    }
    if (!COMMANDS.has(cmd)) throw new Usage(`unknown command ${cmd}`);

    const store = await import("../lib/foundry/scout/store.ts");
    const { dryOnlyFrom } = await import("@gt/kernel/dryrun");
    const dryOnly = dryOnlyFrom(io.env);

    if (cmd === "doctor") {
      const { blocking, doctor, doctorLine } = await import("../lib/foundry/scout/doctor.ts");
      const { storeLocation } = await import("@gt/kernel/process");
      const { OUT_DIRNAME } = await import("../lib/fixtures/mode.ts");
      const checks = await doctor({ env: io.env, storePath: storeLocation(OUT_DIRNAME, io.env["GRAVITONE_STORE_PATH"]), scoutRoot: store.scoutRoot(), dry: flags.has("dry"), ...(io.ports?.spawn === undefined ? {} : { spawn: io.ports.spawn }), ...(io.ports?.keyFetch === undefined ? {} : { keyFetch: io.ports.keyFetch }) });
      const failed = blocking(checks);
      if (json) doc({ ok: failed.length === 0, checks });
      else for (const c of checks) io.out(doctorLine(c));
      return failed.length === 0 ? 0 : 1;
    }

    if (cmd === "open") {
      if (flags.has("live") && dryOnly) throw new Refused("GRAVITONE_DRY_ONLY=1 pins this shell dry: a live night is refused here (open without --live for a dry one)");
      const until = str("until");
      const { tasteBrief } = await import("../lib/foundry/scout/taste.ts");
      const n = await store.createNight({ dry: !flags.has("live"), ceilingUsd: num("ceiling", DEFAULT_CEILING_USD), target: Math.round(num("target", DEFAULT_TARGET)), clipCap: Math.round(num("clips", DEFAULT_CLIP_CAP)), assetCap: Math.round(num("assets", DEFAULT_ASSET_CAP)), now: now(), ...(until === undefined ? {} : { deadline: deadlineOf(until, now()) }) });
      fs.writeFileSync(path.join(store.nightDir(n.id), "taste.md"), await tasteBrief(n.id), "utf8");
      // The registry digest beside it (spark registry-feedback-loop): `registry: none` when none resolves.
      const { registryDigest } = await import("../lib/foundry/scout/registry.ts");
      fs.writeFileSync(path.join(store.nightDir(n.id), "registry.md"), (await registryDigest()).text, "utf8");
      if (json) doc({ ok: true, night: n.id, dry: n.dry, ceilingUsd: n.ceilingUsd, target: n.target, clipCap: n.clipCap, assetCap: n.assetCap, ...(n.deadline === undefined ? {} : { deadline: n.deadline }), taste: path.join(store.nightDir(n.id), "taste.md"), registry: path.join(store.nightDir(n.id), "registry.md") });
      else io.out(n.id);
      say(`night ${n.id} · ${n.dry ? "dry" : "LIVE"} · ceiling $${n.ceilingUsd} · target ${n.target} · clips ${n.clipCap} · assets ${n.assetCap ?? DEFAULT_ASSET_CAP}${n.deadline === undefined ? "" : ` · until ${n.deadline}`}`);
      return 0;
    }

    if (cmd === "add-source") {
      const id = nightArg();
      const { addSources } = await import("../lib/foundry/scout/sources.ts");
      const r = await addSources(id, await input(), io.ports?.resolve === undefined ? {} : { resolve: io.ports.resolve });
      if (!r.ok) throw new Refused(r.error.message);
      for (const s of r.value.added) say(`  + ${s.id} ${s.kind.padEnd(5)} ${s.url}`);
      for (const s of r.value.skipped) say(`  - skipped ${s.url}: ${s.why}`);
      if (json) doc({ ok: true, night: id, added: r.value.added.map((s) => ({ id: s.id, url: s.url, kind: s.kind })), skipped: r.value.skipped });
      return 0;
    }

    if (cmd === "finding" || cmd === "watch") {
      const id = nightArg();
      const { addFindings, addWatch } = await import("../lib/foundry/scout/sources.ts");
      const r =
        cmd === "finding"
          ? await addFindings(id, await input())
          : await addWatch(id, { entry: str("entry") ?? "", why: str("why") ?? "", sourceIds: list("sources") }).then((w) => (w.ok ? { ok: true as const, value: [w.value] } : w));
      if (!r.ok) throw new Refused(r.error.message);
      for (const c of r.value) say(`  + ${c.id} ${c.kind} ${c.status}`);
      if (json) doc({ ok: true, night: id, candidates: r.value });
      return 0;
    }

    // Everything below reads or launches kernel jobs: the store this process names.
    const { closeProcessKernel, processKernel, storeLocation } = await import("@gt/kernel/process");
    const { OUT_DIRNAME } = await import("../lib/fixtures/mode.ts");
    const location = storeLocation(OUT_DIRNAME, io.env["GRAVITONE_STORE_PATH"]);
    const opened = processKernel(location);
    if (!opened.ok) throw opened.error;
    const acts = await import("../lib/foundry/scout/acts.ts");
    const ctx = { store: opened.value.store, location, actor: { kind: "operator" as const, id: "scout-cli" }, dryOnly, live: flags.has("live"), detach: flags.has("detach"), say, now };
    try {
      if (cmd === "status") {
        const id = pos[1];
        if (id === undefined) {
          const nights = await store.listNights();
          if (json) doc({ ok: true, nights });
          else if (nights.length === 0) io.out(`no nights under ${store.scoutRoot()}`);
          else for (const n of nights) io.out(`${n.id.padEnd(13)} ${n.state.padEnd(9)} ${(n.stop ?? "").padEnd(17)} ${n.dry ? "dry " : "live"}  ${n.rendered} rendered · ${n.failed} failed · ${n.pending} pending · ${n.sources} sources`);
          return 0;
        }
        const n = await store.readNight(id);
        const b = acts.money(ctx, n);
        if (json) doc({ ok: true, summary: store.summarise(n), budget: b, morning: acts.morning(n, b), night: n });
        else {
          io.out(`night ${n.id} · ${n.state}${n.stop === undefined ? "" : ` (${n.stop})`} · ${n.dry ? "dry" : "live"} · ${acts.budgetLine(b)}`);
          for (const s of n.sources) io.out(`  ${s.id} ${s.kind.padEnd(5)} ${s.status.padEnd(8)} ${s.files.length} file(s)  ${s.url}${s.error === undefined ? "" : `\n         ${s.error}`}`);
          for (const c of n.candidates) io.out(`  ${c.id} ${c.kind.padEnd(7)} ${c.status.padEnd(8)} ${c.sourceIds.join(",")}${c.jobId === undefined ? "" : `  ${c.jobId}`}${c.error === undefined ? "" : `\n         ${c.error}`}`);
        }
        return 0;
      }

      if (cmd === "close") {
        const id = nightArg();
        const stop = str("stop");
        if (stop !== undefined && !acts.isStopReason(stop)) throw new Usage(`--stop is one of deadline, budget, target, failure, sources-exhausted, operator; got "${stop}"`);
        const m = await acts.closeAct(ctx, id, stop);
        if (json) doc({ ok: true, ...m });
        else {
          io.out(`night ${m.night} ${m.state}${m.stop === undefined ? "" : ` (${m.stop})`} · packet ${m.packet} · /board/${m.packet}`);
          for (const [k, by] of Object.entries(m.byKind)) io.out(`  ${k.padEnd(8)} ${Object.entries(by).map(([s, v]) => `${v} ${s}`).join(" · ")}`);
          io.out(`  settled $${m.settledUsd.toFixed(2)} · held $${m.heldUsd.toFixed(2)}`);
        }
        return 0;
      }

      if (cmd === "ingest") {
        const id = nightArg();
        const source = str("source");
        await acts.launchable(ctx, id, { spends: false });
        // --retry: a failed source in scope goes back to pending, its sentence and files dropped -
        // the only way a source the tools refused is taken again (an ingest plans pending ones).
        if (flags.has("retry")) {
          await store.mutateNight(id, (n) => {
            const again = n.sources.filter((s) => s.status === "failed" && (source === undefined || s.id === source));
            if (again.length === 0) return n;
            const ids = new Set(again.map((s) => s.id));
            return { ...n, sources: n.sources.map((s) => (ids.has(s.id) ? { id: s.id, url: s.url, kind: s.kind, title: s.title, ...(s.channel === undefined ? {} : { channel: s.channel }), why: s.why, found: s.found, ...(s.watch === undefined ? {} : { watch: s.watch }), rights: s.rights, status: "pending" as const, files: [] } : s)) };
          });
        }
        const { driveIngest, launchIngest } = await import("../lib/producers/scoutIngest.ts");
        const r = await launchIngest(ctx.store, { nightId: id, ...(source === undefined ? {} : { sourceId: source }) }, { actor: ctx.actor });
        if (!r.ok) throw new Refused(r.error.message);
        if (r.value.kind === "nothing") {
          say(`nothing pending in night ${id}${source === undefined ? "" : ` for ${source}`}`);
          if (json) doc({ ok: true, night: id, outcome: "nothing" });
          return 0;
        }
        const jobId = r.value.jobId;
        say(r.value.kind === "launched" ? `ingest ${r.value.sources.join(", ")} as ${jobId}` : `ingest job ${jobId} is already ${r.value.state}`);
        let outcome = "detached";
        if (!ctx.detach) {
          const t0 = Date.now();
          const d = await driveIngest(ctx.store, location, jobId, { dryOnly, ...(io.ports?.ingest === undefined ? {} : { deps: io.ports.ingest }), onStep: (s) => say(`  ${Math.round((Date.now() - t0) / 1000)}s  ${s}`) });
          outcome = d.ok ? d.value.outcome : d.error.message;
        }
        const n = await store.readNight(id);
        for (const s of n.sources) if (source === undefined || s.id === source) say(`  ${s.id} ${s.status}${s.status === "ingested" ? ` · ${s.files.length} file(s)` : ""}${s.error === undefined ? "" : ` · ${s.error}`}`);
        const good = outcome === "done" || outcome === "detached";
        if (json) doc({ ok: good, night: id, jobId, outcome, sources: n.sources.map((s) => ({ id: s.id, status: s.status, files: s.files, ...(s.error === undefined ? {} : { error: s.error }) })) });
        return good ? 0 : 1;
      }

      if (cmd === "asset") {
        const id = nightArg();
        const { assetAct } = await import("../lib/foundry/scout/asset.ts");
        const r = await assetAct(ctx, id, await input("brief"), io.ports?.asset ?? {});
        const c = r.candidate;
        const failed = c.status === "failed" || (r.outcome !== undefined && !["done", "detached"].includes(r.outcome));
        say(`${c.id} asset3d ${c.status}${r.outcome === undefined ? "" : ` · ${r.outcome}`}${c.assetId === undefined ? "" : ` · mesh asset ${c.assetId}`}${c.error === undefined ? "" : ` · ${c.error}`}`);
        for (const v of r.asset?.variants ?? []) say(`  ${v.id} ${v.technique} ${v.status}${v.error === undefined ? "" : ` · ${v.error}`}`);
        if (json) doc({ ok: !failed, night: id, candidate: c, ...(r.outcome === undefined ? {} : { outcome: r.outcome }), ...(r.asset === undefined ? {} : { asset: r.asset }), budget: acts.money(ctx, await store.readNight(id)) });
        return failed ? 1 : 0;
      }

      if (cmd === "style" || cmd === "scene") {
        const id = nightArg();
        // --use: what content the run can serve, one line. A run launched without one says so on the Board.
        const use = str("use")?.trim();
        if (use !== undefined && (use === "" || use.length > USE_MAX)) usage(`--use is one line of at most ${USE_MAX} characters: the content this run can help make`);
        const r =
          cmd === "style"
            ? await acts.styleAct(ctx, id, list("sources").length > 0 ? list("sources") : usage("style needs --sources s-01,s-03"), str("slug"), use)
            : await acts.sceneAct(ctx, id, str("source") ?? usage("scene needs --source s-NN"), flags.has("frames") ? list("frames") : undefined, use);
        const c = r.candidate;
        const failed = c.status === "failed" || (r.outcome !== undefined && !["done", "detached", "enqueued", "launched", "queued", "running"].includes(r.outcome));
        say(`${c.id} ${c.kind} ${c.status}${r.outcome === undefined ? "" : ` · ${r.outcome}`}${c.error === undefined ? "" : ` · ${c.error}`}`);
        if (json) doc({ ok: !failed, night: id, candidate: c, ...(r.outcome === undefined ? {} : { outcome: r.outcome }), budget: acts.money(ctx, await store.readNight(id)) });
        return failed ? 1 : 0;
      }
    } finally {
      closeProcessKernel();
    }
    throw new Usage(`unknown command ${cmd}`);
  } catch (e) {
    const message = errorMessage(e);
    if (e instanceof Usage) {
      io.err(`${message}\n${USAGE}`);
      if (json) doc({ ok: false, usage: message });
      return 2;
    }
    io.err(message);
    if (json) doc({ ok: false, error: message });
    return 1;
  }
}

function usage(message: string): never {
  throw new Usage(message);
}

async function readStdin(): Promise<string> {
  const parts: Buffer[] = [];
  for await (const chunk of process.stdin) parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(parts).toString("utf8");
}

function runInherited(cmd: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, [...args], { stdio: "inherit", windowsHide: true });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** .env then .env.local, never clobbering an exported value (pipeline/foundry/extract.mts). */
function loadEnv(root: string): void {
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

const entry = process.argv[1];
if (entry !== undefined && pathToFileURL(path.resolve(entry)).href.toLowerCase() === import.meta.url.toLowerCase()) {
  loadEnv(ROOT);
  // The stores resolve from process.cwd(); a --json input and a folder are resolved where they were typed, before the move.
  const args = process.argv.slice(2).map((a, i, all) => ((all[i - 1] === "--json" || all[i - 1] === "--brief" || all[i - 1] === "folder") && a !== "-" && fs.existsSync(a) ? path.resolve(a) : a));
  process.chdir(ROOT);
  process.exitCode = await runCli(args, { env: process.env, out: (s) => console.log(s), err: (s) => console.error(s) });
}
