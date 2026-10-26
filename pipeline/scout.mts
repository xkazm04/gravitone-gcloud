// SCOUT - the night's CLI (spark media-training-loop). The /scout skill drives it;
// an operator may type any line of it. Docs: docs/scout.md.
//
//   ONE NIGHT TYPE (spark scout-vision S3): every night is a scout night. The muse wing folded in; its four nights
//   are a read-only archive that only `status --wing muse [<night>]` lists - any other command under --wing muse
//   is refused (exit 3), naming /scout. `--wing scout` is accepted and changes nothing.
//   npx tsx pipeline/scout.mts doctor [--dry] [--json]
//   npx tsx pipeline/scout.mts open [--ceiling 15] [--target 20] [--clips 2] [--assets 3] [--ideas 25] [--reels 6] [--until HH:MM] [--live] [--json]
//   npx tsx pipeline/scout.mts add-source <night> --json <file|->
//   npx tsx pipeline/scout.mts ingest <night> [--source s-NN] [--detach]
//   npx tsx pipeline/scout.mts style <night> --sources s-01,s-03 --use "<content it serves>" [--slug x] [--detach]
//   npx tsx pipeline/scout.mts scene <night> --source s-NN --use "<content it serves>" [--frames k-012.jpg] [--detach]
//   npx tsx pipeline/scout.mts asset <night> --brief <file|-> [--detach]
//   npx tsx pipeline/scout.mts ideas <night> --json <file|-> [--detach]   (lib/foundry/scout/idea.ts)
//   npx tsx pipeline/scout.mts finding <night> --json <file|->
//   npx tsx pipeline/scout.mts direction <night> --json <file|->   (lib/foundry/scout/direction.ts)
//   npx tsx pipeline/scout.mts watch <night> --entry "..." --why "..." [--sources s-01,s-02]
//   npx tsx pipeline/scout.mts close <night> [--stop <reason>]
//   npx tsx pipeline/scout.mts status [<night>] [--json]
//   npx tsx pipeline/scout.mts leads [--json] | lead <key> --json <file|->   (lib/foundry/scout/leadFile.ts)
//   npx tsx pipeline/scout.mts folder <dir> [pipeline/foundry/extract.mts args]
//
// THE MONEY. A night is DRY unless it was opened with --live (refused under
// GRAVITONE_DRY_ONLY=1), and every launch from it inherits its mode: a dry night's
// jobs answer every paid call with a stand-in. Every launch's job ceiling is what
// the night has left (lib/foundry/scout/budget.ts); a launch whose worst case is
// over that, a launch from a closed night, and a launch after the deadline (which
// closes the night, `stop: deadline`) are refused with the numbers. Ingest is free;
// an ideas batch is drawn on the Leonardo studio's prepaid credits and its stats reels
// are authored on the Claude seat, neither of which the ceiling caps, so it is refused
// by the night's idea and reel caps and never by its money.
//
// --json: one JSON document on stdout, progress on stderr. Under add-source, finding,
// direction, ideas and lead, `--json <file|->` names the INPUT, and the output is JSON as well.
// EXIT 0 done · 1 failed or refused · 2 usage · 3 refused under --wing muse. Never touches foundry-out/ when
// GRAVITONE_STORE_PATH and SCOUT_STORE_DIR point elsewhere.

import { USE_MAX } from "../lib/foundry/scout/types.ts";
import type { KeyFetch } from "../lib/imaging/keyProbe.ts";
import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { errorMessage } from "@gt/domain/errors";

import { DEFAULT_WING, SCOUT_WINGS, isWing } from "../lib/foundry/scout/wing.ts";
import { DEFAULT_ASSET_CAP, DEFAULT_CEILING_USD, DEFAULT_CLIP_CAP, DEFAULT_IDEA_CAP, DEFAULT_REEL_CAP, DEFAULT_TARGET, DEFAULT_STORYBOARD_CAP, DEFAULT_TRACK_CAP, DEFAULT_VISUALIZER_CAP, MAX_IDEA_CAP, MAX_REEL_CAP, MAX_STORYBOARD_CAP, MAX_TRACK_CAP, MAX_VISUALIZER_CAP } from "../lib/foundry/scout/types.ts";

type IngestDeps = import("../lib/foundry/scout/ingest.ts").IngestDeps;
type Spawn = import("../lib/foundry/scout/ingest.ts").Spawn;
type Resolver = import("../lib/imaging/safeUrl.ts").Resolver;
type AssetEngines = import("../lib/producers/scoutAssetActs.ts").AssetEngines;
type IdeasEngines = import("../lib/foundry/scout/idea.ts").IdeasEngines;
type TrackEngines = import("../lib/foundry/scout/track.ts").TrackEngines;
type VisualizerEngines = import("../lib/foundry/scout/visualizer.ts").VisualizerEngines;
type StoryboardEngines = import("../lib/foundry/scout/storyboard.ts").StoryboardEngines;
type PieceEngines = import("../lib/foundry/scout/piece.ts").PieceEngines;
type SheetEngines = import("../lib/foundry/scout/sheet.ts").SheetEngines;

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
  /** `ideas`' studio still and its reels launcher; a test hands fakes (absent: the imaging router, lib/producers/scoutReel.ts). */
  readonly ideas?: IdeasEngines;
  /** `track`'s Suno browser and clip download; `visualizer`'s mv queue, launch and drive. A test hands fakes. */
  readonly track?: TrackEngines;
  readonly visualizer?: VisualizerEngines;
  /** `storyboard`'s Flux frame; a test hands a fake (absent: the scout-storyboard producer on gpu.local). */
  readonly storyboard?: StoryboardEngines;
  readonly piece?: PieceEngines;
  readonly sheet?: SheetEngines;
};
export type Io = { readonly env: Readonly<Record<string, string | undefined>>; readonly out: (s: string) => void; readonly err: (s: string) => void; readonly ports?: CliPorts };

const ROOT = path.resolve(import.meta.dirname, "..");
const USAGE = [
  "usage: npx tsx pipeline/scout.mts <command> [--json]",
  "  doctor [--dry] [--tracks N]                 the box, the keys, the store (and the Suno browser when tracks > 0)",
  `  open [--ceiling 15] [--target 20] [--clips 2] [--assets 3] [--ideas ${DEFAULT_IDEA_CAP}] [--reels ${DEFAULT_REEL_CAP}] [--tracks ${DEFAULT_TRACK_CAP}] [--visualizers ${DEFAULT_VISUALIZER_CAP}] [--storyboards ${DEFAULT_STORYBOARD_CAP}] [--until HH:MM] [--live]`,
  "  add-source <night> --json <file|->         [{url, kind, title, channel?, why, found, watch?, rich?} | {fromIdea: <night>/<c-id>, why?}]",
  "  ingest <night> [--source s-NN] [--detach]",
  "  style <night> --sources s-01,s-03 --use \"<content>\" [--slug x] [--seed <batch>/sd-NNN] [--detach]",
  "  scene <night> --source s-NN --use \"<content>\" [--frames k-012.jpg] [--seed <batch>/sd-NNN] [--detach]",
  "  asset <night> --brief <file|-> [--seed <batch>/sd-NNN] [--detach]  {class, subject, use, style?, kind?, techniques?, fromIdea?}",
  "  ideas <night> --json <file|-> [--detach]   [{title, target: scene|style|asset3d|stats, genre, prompt, anchor: {kind: watch|gap|free, ref}, app, appTarget, aim, look?, reel?}]",
  "                                             reel (stats only): {brief: {case, title, hook, unit, kind, data, steps?, illustrative: true}, approach: {name, medium, grammar, density, direction, falsifier}}",
  "  finding <night> --json <file|->            [{sourceIds, template, step, claim, quote, restates?}]",
  "  direction <night> --json <file|->          {title, format: short|video, genre, style, tone, audience, premise, basedOn: [<night>/<cell id>], use?}",
  '  watch <night> --entry "..." --why "..." [--sources s-01]',
  "  close <night> [--stop deadline|budget|target|failure|sources-exhausted|operator]",
  "  status [<night>]",
  "  seeds new --json <file|-> [--dry]          [{sentence, genre, subgenre, type, audience: kids|family|adult, format: short|video, parent?: <batch>/sd-NNN, music?}]",
  "                                             music (required on a music video|lyric video|visualizer seed): {instruments: [..6], tempo: 40-220, mood, vocals: instrumental|female|male|duet|choir}",
  "  seeds status [<batch>]",
  "  track <night> --seed <batch>/sd-NNN [--detach] · track <night> --collect",
  "  visualizer <night> --track <night>/<c-id>/<aN> [--detach] · visualizer <night> --collect",
  "  storyboard <night> [--json <briefs|->] [--detach] · storyboard <night> --collect   (a brief with genre: gn-... is a TRIAL)",
  "  propose <night> --json <file|->            [{kind: genre, name, fromStoryboard, look, grammar} | {kind: venture, name, ventureKind: channel|album, frame, basedOn}]",
  "  piece <night> [--genre gn-...] [--detach] · piece <night> --collect",
  "  sheet <night> [--character <name>] [--detach] · sheet <night> --collect   (a kept character's reference sheet)",
  "  genre list | genre retire <gn-id> · venture list | venture retire <vn-id>",
  "  plan <night> --json <file|->              [{kind: storyboards|ideas|extract|scenes|assets|sheets|reels|draft, payload, why}]   (the night-fill queue)",
  "  reel <night> --json <file|-> [--detach] · reel <night> --collect   [{fromIdea, source: {kind: table|article|what-if, title, url?, quote?, premise?}, data, cut}]",
  "  reel-cut <night> --json <file|-> [--detach]   [{fromReel: <night>/<c-id>, seconds: 30-120}]   (a kept real reel, cut in full)",
  "  leads · lead <key> --json <file|->         {claim, kind: technique|application|subject, nearest?, confidence}",
  "  folder <dir> [pipeline/foundry/extract.mts args]",
].join("\n");

class Usage extends Error {}
/** A refusal the CLI makes itself; the acts' `Refusal` exits the same way. */
class Refused extends Error {}
const COMMANDS = new Set(["doctor", "open", "add-source", "ingest", "style", "scene", "asset", "ideas", "finding", "direction", "watch", "close", "status", "leads", "lead", "seeds", "track", "visualizer", "storyboard", "propose", "piece", "genre", "venture", "sheet", "plan", "reel", "reel-cut"]);
const BOOL = new Set(["json", "live", "detach", "dry", "help", "retry"]);

/** argv -> positionals and flags. `--json` takes a value (the input file, or `-`) only under add-source, finding, direction, ideas, storyboard, lead and seeds new. */
function parse(argv: readonly string[]): { pos: string[]; flags: Map<string, string | true> } {
  const pos: string[] = [];
  const flags = new Map<string, string | true>();
  const cmd = argv.find((a) => !a.startsWith("--"));
  const reads = cmd === "add-source" || cmd === "finding" || cmd === "direction" || cmd === "propose" || cmd === "ideas" || cmd === "lead" || (cmd === "seeds" && argv.includes("new")) || (cmd === "storyboard" && !argv.includes("--collect")) || cmd === "plan" || ((cmd === "reel" || cmd === "reel-cut") && !argv.includes("--collect"));
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

/** What any command but `status` answers under `--wing muse` (spark scout-vision S3). */
export const MERGED_WING = "the muse wing is merged into /scout (spark scout-vision S3); its nights are an archive - status --wing muse lists them";

/**
 * `--wing muse` reads the muse ARCHIVE (lib/foundry/scout/store.ts readArchiveNights) and only `status` takes it; absent or
 * `scout`, every command runs on the scout root, where every new night is opened.
 */
export async function runCli(argv: readonly string[], io: Io): Promise<number> {
  const at = argv.indexOf("--wing");
  const w = at < 0 ? DEFAULT_WING : argv[at + 1];
  if (!isWing(w)) {
    io.err(`--wing is one of ${SCOUT_WINGS.join(", ")}, got "${w ?? ""}"`);
    return 2;
  }
  const rest = argv.filter((_, i) => at < 0 || (i !== at && i !== at + 1));
  if (w === DEFAULT_WING) return runScout(rest, io, false);
  if (rest.find((a) => !a.startsWith("--")) !== "status") {
    io.err(MERGED_WING);
    return 3;
  }
  const { withWing } = await import("../lib/foundry/scout/wingScope.ts");
  return withWing("muse", () => runScout(rest, io, true));
}

/** `archive`: a `status` of the muse archive, read-only (runCli admits nothing else under it). */
async function runScout(argv: readonly string[], io: Io, archive: boolean): Promise<number> {
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
      const checks = await doctor({ env: io.env, storePath: storeLocation(OUT_DIRNAME, io.env["GRAVITONE_STORE_PATH"]), scoutRoot: store.scoutRoot(), dry: flags.has("dry"), tracks: num("tracks", DEFAULT_TRACK_CAP), ...(io.ports?.spawn === undefined ? {} : { spawn: io.ports.spawn }), ...(io.ports?.keyFetch === undefined ? {} : { keyFetch: io.ports.keyFetch }) });
      const failed = blocking(checks);
      if (json) doc({ ok: failed.length === 0, checks });
      else for (const c of checks) io.out(doctorLine(c));
      return failed.length === 0 ? 0 : 1;
    }

    if (cmd === "open") {
      if (flags.has("live") && dryOnly) throw new Refused("GRAVITONE_DRY_ONLY=1 pins this shell dry: a live night is refused here (open without --live for a dry one)");
      const until = str("until");
      const ideaCap = num("ideas", DEFAULT_IDEA_CAP);
      if (!Number.isInteger(ideaCap) || ideaCap > MAX_IDEA_CAP) throw new Usage(`--ideas is a whole number from 1 to ${MAX_IDEA_CAP}, got ${ideaCap}`);
      const reelCap = num("reels", DEFAULT_REEL_CAP);
      if (!Number.isInteger(reelCap) || reelCap > MAX_REEL_CAP) throw new Usage(`--reels is a whole number from 1 to ${MAX_REEL_CAP}, got ${reelCap}`);
      const trackCap = num("tracks", DEFAULT_TRACK_CAP);
      if (!Number.isInteger(trackCap) || trackCap < 0 || trackCap > MAX_TRACK_CAP) throw new Usage(`--tracks is a whole number from 0 to ${MAX_TRACK_CAP}, got ${trackCap}`);
      const visualizerCap = num("visualizers", DEFAULT_VISUALIZER_CAP);
      if (!Number.isInteger(visualizerCap) || visualizerCap < 0 || visualizerCap > MAX_VISUALIZER_CAP) throw new Usage(`--visualizers is a whole number from 0 to ${MAX_VISUALIZER_CAP}, got ${visualizerCap}`);
      const storyboardCap = num("storyboards", DEFAULT_STORYBOARD_CAP);
      if (!Number.isInteger(storyboardCap) || storyboardCap < 0 || storyboardCap > MAX_STORYBOARD_CAP) throw new Usage(`--storyboards is a whole number from 0 to ${MAX_STORYBOARD_CAP}, got ${storyboardCap}`);
      const { tasteBrief } = await import("../lib/foundry/scout/taste.ts");
      // One night type (spark scout-vision S3): a character idea's 9:16 and studio quality are the ideas door's, not the night's.
      const n = await store.createNight({ dry: !flags.has("live"), ceilingUsd: num("ceiling", DEFAULT_CEILING_USD), target: Math.round(num("target", DEFAULT_TARGET)), clipCap: Math.round(num("clips", DEFAULT_CLIP_CAP)), assetCap: Math.round(num("assets", DEFAULT_ASSET_CAP)), ideaCap, reelCap, trackCap, visualizerCap, storyboardCap, now: now(), ...(until === undefined ? {} : { deadline: deadlineOf(until, now()) }) });
      // Last night's load opens the brief (lib/foundry/scout/load.ts): the samples are the kernel store's.
      const kp = await import("@gt/kernel/process");
      const { nightLoad } = await import("../lib/foundry/scout/load.ts");
      const { OUT_DIRNAME } = await import("../lib/fixtures/mode.ts");
      const k = kp.processKernel(kp.storeLocation(OUT_DIRNAME, io.env["GRAVITONE_STORE_PATH"]));
      try {
        // The graph's branches, the backlog (spark scout-vision) and the tracks waiting for a visualizer close the brief (spark scout-decision-graph).
        const { branchesSection, buildGraph } = await import("../lib/foundry/scout/graph.ts");
        const { readSteer } = await import("../lib/foundry/scout/steer.ts");
        const { tracksSection } = await import("../lib/foundry/scout/track.ts");
        const { backlogOf, backlogSection } = await import("../lib/foundry/scout/backlog.ts");
        const { listSeedBatches } = await import("../lib/foundry/scout/seedStore.ts");
        const graph = await buildGraph({ ...(k.ok ? { store: k.value.store } : {}), now: now() });
        const steer = await readSteer();
        const others = (await store.readAllNights()).filter((x) => x.id !== n.id);
        const backlog = backlogSection(backlogOf(others, await listSeedBatches(), steer), others);
        // The extra sections, in order (spark scout-vision S3 adds `## Sheets to draw`: kept characters owed a reference sheet).
        const rooted = await store.readRootedNights();
        const { sheetsToDraw } = await import("../lib/foundry/scout/sheet.ts");
        const { keptCharacters } = await import("../lib/foundry/scout/characters.ts");
        const sheets = sheetsToDraw(rooted, keptCharacters(rooted));
        // `## Asset needs` (spark scout-vision S4): the game's own open needs, the only ones a project asset brief may answer.
        const { needsRoot, needsSection, readNeeds } = await import("../lib/foundry/scout/needs.ts");
        const needs = needsSection([await readNeeds("bp", { now: now(), root: needsRoot(io.env) })]);
        const extra = [...branchesSection(graph, steer), ...backlog, ...(!k.ok ? [] : (await import("../lib/foundry/scout/genres.ts")).genreTaste(k.value.store, others)), ...sheets, ...needs, ...tracksSection(others)];
        fs.writeFileSync(path.join(store.nightDir(n.id), "taste.md"), await tasteBrief(n.id, k.ok ? (x) => nightLoad(k.value.store, x, now().getTime()) : undefined, extra), "utf8");
      } finally {
        kp.closeProcessKernel();
      }
      // The registry digest beside it (spark registry-feedback-loop): `registry: none` when none resolves.
      const { registryDigest } = await import("../lib/foundry/scout/registry.ts");
      fs.writeFileSync(path.join(store.nightDir(n.id), "registry.md"), (await registryDigest()).text, "utf8");
      if (json) doc({ ok: true, night: n.id, dry: n.dry, ceilingUsd: n.ceilingUsd, target: n.target, clipCap: n.clipCap, assetCap: n.assetCap, ideaCap: n.ideaCap, reelCap: n.reelCap, ...(n.deadline === undefined ? {} : { deadline: n.deadline }), taste: path.join(store.nightDir(n.id), "taste.md"), registry: path.join(store.nightDir(n.id), "registry.md") });
      else io.out(n.id);
      say(`night ${n.id} · ${n.dry ? "dry" : "LIVE"} · ceiling $${n.ceilingUsd} · target ${n.target} · clips ${n.clipCap} · assets ${n.assetCap ?? DEFAULT_ASSET_CAP} · ideas ${n.ideaCap ?? DEFAULT_IDEA_CAP} · reels ${n.reelCap ?? DEFAULT_REEL_CAP}${n.deadline === undefined ? "" : ` · until ${n.deadline}`}`);
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

    if (cmd === "direction") {
      const id = nightArg();
      const { addDirection } = await import("../lib/foundry/scout/direction.ts");
      const r = await addDirection(id, await input());
      if (!r.ok) throw new Refused(r.error.message);
      say(`  + ${r.value.id} direction ${r.value.status} · ${r.value.format} · ${r.value.genre} · based on ${r.value.basedOn.length} kept`);
      if (json) doc({ ok: true, night: id, candidate: r.value });
      return 0;
    }

    // The night's proposals to birth a genre or a venture (spark scout-vision S2): words only, no kernel job.
    if (cmd === "propose") {
      const id = nightArg();
      const { addProposals } = await import("../lib/foundry/scout/propose.ts");
      const r = await addProposals(id, await input());
      if (!r.ok) throw new Refused(r.error.message);
      for (const c of r.value) say(`  + ${c.id} ${c.kind} proposal ${c.status} · ${c.name}`);
      if (json) doc({ ok: true, night: id, candidates: r.value });
      return 0;
    }

    // A batch of one-sentence seeds (spark scout-decision-graph): words only, no kernel job.
    if (cmd === "seeds") {
      const { seedsCommand } = await import("../lib/foundry/scout/seeds.ts");
      const r = await seedsCommand(pos[1], { ...(pos[2] === undefined ? {} : { batch: pos[2] }), input: () => input(), dry: flags.has("dry"), now: now() });
      for (const l of r.lines) say(l);
      if (json) doc(r.doc);
      return r.code;
    }

    // The registry leads the Board's commits queued: listed, and filed one claim at a time.
    if (cmd === "leads" || cmd === "lead") {
      const { leadsCommand } = await import("../lib/foundry/scout/leadFile.ts");
      const r = await leadsCommand(cmd === "leads" ? undefined : { key: pos[1] ?? usage("lead needs a key: `scout.mts leads` lists them"), input: await input() }, { env: io.env, now: now() });
      for (const l of r.lines) say(l);
      if (json) doc(r.doc);
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
          // The archive's nights are named by their run id: their ids collide with scout nights.
          const named = (x: string): string => (archive ? `muse:${x}`.padEnd(18) : x.padEnd(13));
          if (json) doc({ ok: true, ...(archive ? { archive: true } : {}), nights });
          else if (nights.length === 0) io.out(`no nights under ${store.scoutRoot()}`);
          else for (const n of nights) io.out(`${named(n.id)} ${n.state.padEnd(9)} ${(n.stop ?? "").padEnd(17)} ${n.dry ? "dry " : "live"}  ${n.rendered} rendered · ${n.failed} failed · ${n.pending} pending · ${n.sources} sources`);
          return 0;
        }
        const n = await store.readNight(id);
        const b = acts.money(ctx, n);
        const { ideaCapOf, ideasUsed, reelCapOf, reelsUsed } = await import("../lib/foundry/scout/idea.ts");
        const ideas = { used: ideasUsed(n), cap: ideaCapOf(n) };
        const reels = { used: reelsUsed(n), cap: reelCapOf(n) };
        // The box against the band over the last 15 minutes, what waits now, and the jobs only the operator retries.
        const { interruptedOf, recentLine, recentLoad, waitingLine } = await import("../lib/foundry/scout/load.ts");
        const recent = recentLoad(ctx.store, now().getTime());
        const interrupted = interruptedOf(ctx.store, n);
        const load = { last15: recent.avg, band: recent.band, waiting: recent.waiting, samples: recent.samples };
        // The backlog and its seed gate (spark scout-vision), over the scout root even for an archive night.
        const { backlogOf } = await import("../lib/foundry/scout/backlog.ts");
        const { listSeedBatches } = await import("../lib/foundry/scout/seedStore.ts");
        const { readSteer } = await import("../lib/foundry/scout/steer.ts");
        const { withWing } = await import("../lib/foundry/scout/wingScope.ts");
        const bl = await withWing("scout", async () => backlogOf(await store.readAllNights(), await listSeedBatches(), await readSteer()));
        const backlog = { waiting: bl.waiting.length, seedsWaiting: bl.seedsWaiting, gated: bl.gated, freshAllowed: bl.freshAllowed };
        if (json) doc({ ok: true, ...(archive ? { archive: true } : {}), summary: store.summarise(n), budget: b, ideas, reels, load, interrupted, morning: acts.morning(n, b), backlog, night: n });
        else {
          io.out(`${archive ? "archive night muse:" : "night "}${n.id} · ${n.state}${n.stop === undefined ? "" : ` (${n.stop})`} · ${n.dry ? "dry" : "live"} · ${acts.budgetLine(b)} · ideas ${ideas.used}/${ideas.cap} · reels ${reels.used}/${reels.cap}`);
          io.out(recentLine(recent));
          const waiting = waitingLine(recent);
          if (waiting !== undefined) io.out(waiting);
          if (interrupted.length > 0) io.out(`interrupted: ${interrupted.join(" · ")}`);
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
          io.out(`  Gemini settled $${m.settledUsd.toFixed(2)} · held $${m.heldUsd.toFixed(2)} · uncapped $${m.uncappedUsd.toFixed(2)} (Claude seat, Leonardo credits)`);
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
            return { ...n, sources: n.sources.map((s) => (ids.has(s.id) ? { id: s.id, url: s.url, kind: s.kind, title: s.title, ...(s.channel === undefined ? {} : { channel: s.channel }), why: s.why, found: s.found, ...(s.watch === undefined ? {} : { watch: s.watch }), ...(s.rich === undefined ? {} : { rich: s.rich }), rights: s.rights, ...(s.fromIdea === undefined ? {} : { fromIdea: s.fromIdea }), status: "pending" as const, files: [] } : s)) };
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
        const { briefFromIdea, originWith } = await import("../lib/foundry/scout/direction.ts");
        // `fromIdea`: the kept idea this asset develops. The asset door is the mesh brief's own, so the
        // ref is checked and taken off here, and set on the candidate once the act has written it.
        const from = await briefFromIdea(await input("brief"));
        if (!from.ok) throw new Refused(from.error.message);
        // --seed: the kept seed it grows from, checked against the idea's own before anything is launched.
        const { brief, ...idea } = from.value;
        const origin = await originWith(idea, str("seed"));
        if (!origin.ok) throw new Refused(origin.error.message);
        const r = await assetAct(ctx, id, brief, io.ports?.asset ?? {});
        if (origin.value.fromIdea !== undefined || origin.value.fromSeed !== undefined) await acts.markOrigin(id, r.candidate.id, origin.value);
        const c = { ...r.candidate, ...origin.value };
        const failed = c.status === "failed" || (r.outcome !== undefined && !["done", "detached"].includes(r.outcome));
        say(`${c.id} asset3d ${c.status}${r.outcome === undefined ? "" : ` · ${r.outcome}`}${c.assetId === undefined ? "" : ` · mesh asset ${c.assetId}`}${c.error === undefined ? "" : ` · ${c.error}`}`);
        for (const v of r.asset?.variants ?? []) say(`  ${v.id} ${v.technique} ${v.status}${v.error === undefined ? "" : ` · ${v.error}`}`);
        if (json) doc({ ok: !failed, night: id, candidate: c, ...(r.outcome === undefined ? {} : { outcome: r.outcome }), ...(r.asset === undefined ? {} : { asset: r.asset }), budget: acts.money(ctx, await store.readNight(id)) });
        return failed ? 1 : 0;
      }

      if (cmd === "ideas") {
        const id = nightArg();
        const { ideasAct, ideaCapOf, ideasUsed, reelCapOf, reelsUsed } = await import("../lib/foundry/scout/idea.ts");
        const r = await ideasAct(ctx, id, await input(), io.ports?.ideas ?? {});
        for (const c of r.candidates) say(`  ${c.id} idea ${c.target === "stats" ? "stats " : ""}${c.status}${c.image === undefined ? "" : ` · ${c.image}`}${c.error === undefined ? "" : ` · ${c.error}`}`);
        const failed = r.outcome !== undefined && !["done", "detached"].includes(r.outcome);
        if (r.jobId !== undefined) say(`ideas ${r.jobId} · ${r.outcome ?? "?"}`);
        if (r.reelsJobId !== undefined) say(`reels ${r.reelsJobId} · detached`);
        const n = await store.readNight(id);
        if (json) doc({ ok: !failed, night: id, ...(r.jobId === undefined ? {} : { jobId: r.jobId }), ...(r.reelsJobId === undefined ? {} : { reelsJobId: r.reelsJobId }), ...(r.outcome === undefined ? {} : { outcome: r.outcome }), candidates: r.candidates, ideas: { used: ideasUsed(n), cap: ideaCapOf(n) }, reels: { used: reelsUsed(n), cap: reelCapOf(n) } });
        return failed ? 1 : 0;
      }

      // A kept idea composed as a storyboard: up to five local Flux frames + the seat's words (spark scout-storyboards).
      if (cmd === "storyboard") {
        const id = nightArg();
        const sb = await import("../lib/foundry/scout/storyboard.ts");
        if (flags.has("collect")) {
          const got = await sb.collectStoryboards(id, { store: ctx.store });
          for (const c of got) say(`${c.id} storyboard ${c.status}${c.error === undefined ? "" : ` · ${c.error}`}`);
          if (got.length === 0) say(`nothing to collect in night ${id}`);
          if (json) doc({ ok: true, night: id, candidates: got });
          return 0;
        }
        const r = await sb.storyboardAct(ctx, id, await input(), io.ports?.storyboard ?? {});
        for (const c of r.candidates) say(`  ${c.id} storyboard ${c.status} · ${c.fromIdea} · ${(c.images ?? []).filter((f) => f !== null).length}/${c.panels.length} frame(s)${c.error === undefined ? "" : ` · ${c.error}`}`);
        const failed = r.outcome !== undefined && !["done", "detached"].includes(r.outcome);
        const n = await store.readNight(id);
        if (json) doc({ ok: !failed, night: id, jobIds: r.jobIds, ...(r.outcome === undefined ? {} : { outcome: r.outcome }), ...(r.dry === true ? { dry: true } : {}), candidates: r.candidates, storyboards: { used: sb.storyboardsUsed(n), cap: sb.storyboardCapOf(n) } });
        return failed ? 1 : 0;
      }

      // A genre's piece (spark scout-vision S2): its best kept trial rendered in full and cut.
      if (cmd === "piece") {
        const id = nightArg();
        const pc = await import("../lib/foundry/scout/piece.ts");
        if (flags.has("collect")) {
          const got = await pc.collectPieces(id, { store: ctx.store });
          for (const c of got) say(`${c.id} piece ${c.status}${c.error === undefined ? "" : ` · ${c.error}`}`);
          if (got.length === 0) say(`nothing to collect in night ${id}`);
          if (json) doc({ ok: true, night: id, candidates: got });
          return 0;
        }
        const genre = str("genre");
        const r = await pc.pieceAct(ctx, id, genre === undefined ? {} : { genre }, io.ports?.piece ?? {});
        for (const c of r.candidates) say(`  ${c.id} piece ${c.status} · ${c.genre} · from ${c.fromTrial}${c.error === undefined ? "" : ` · ${c.error}`}`);
        if (r.candidates.length === 0) say(`no piece due in night ${id}`);
        const failed = r.outcome !== undefined && !["done", "detached"].includes(r.outcome);
        if (json) doc({ ok: !failed, night: id, jobIds: r.jobIds, ...(r.outcome === undefined ? {} : { outcome: r.outcome }), ...(r.dry === true ? { dry: true } : {}), candidates: r.candidates });
        return failed ? 1 : 0;
      }

      // A kept character's reference sheet (spark scout-vision S3): local Flux, her kept portrait as a late reference.
      if (cmd === "sheet") {
        const id = nightArg();
        const sh = await import("../lib/foundry/scout/sheet.ts");
        if (flags.has("collect")) {
          const got = await sh.collectSheets(id, { store: ctx.store });
          for (const c of got) say(`${c.id} sheet ${c.status}${c.error === undefined ? "" : ` · ${c.error}`}`);
          if (got.length === 0) say(`nothing to collect in night ${id}`);
          if (json) doc({ ok: true, night: id, candidates: got });
          return 0;
        }
        const character = str("character");
        const r = await sh.sheetAct(ctx, id, character === undefined ? {} : { character }, io.ports?.sheet ?? {});
        for (const c of r.candidates) say(`  ${c.id} sheet ${c.status} · ${c.name} · from ${c.fromPortrait}${c.error === undefined ? "" : ` · ${c.error}`}`);
        if (r.candidates.length === 0) say(`no sheet due in night ${id}`);
        const failed = r.outcome !== undefined && !["done", "detached"].includes(r.outcome);
        if (json) doc({ ok: !failed, night: id, jobIds: r.jobIds, ...(r.outcome === undefined ? {} : { outcome: r.outcome }), ...(r.dry === true ? { dry: true } : {}), candidates: r.candidates });
        return failed ? 1 : 0;
      }

      // The night's plan queue (spark scout-vision S6): the worker's night-fill timer launches it while the box idles.
      if (cmd === "plan") {
        const id = nightArg();
        const pl = await import("../lib/foundry/scout/plan.ts");
        const r = await pl.planAct(ctx, id, await input());
        for (const it of r.items) say(`  ${it.id} ${it.kind} ${it.state} · ${it.why}`);
        if (json) doc({ ok: true, night: id, items: r.items });
        return 0;
      }

      // A kept stats idea on real data, and a kept real reel cut in full (spark scout-vision S5).
      if (cmd === "reel" || cmd === "reel-cut") {
        const id = nightArg();
        const rl = await import("../lib/foundry/scout/reel.ts");
        if (flags.has("collect")) {
          const got = await rl.collectReels(id);
          for (const c of got) say(`${c.id} ${cmd} ${c.status}${c.error === undefined ? "" : ` · ${c.error}`}`);
          if (got.length === 0) say(`nothing to collect in night ${id}`);
          if (json) doc({ ok: true, night: id, candidates: got });
          return 0;
        }
        const r = cmd === "reel" ? await rl.reelAct(ctx, id, await input()) : await rl.reelCutAct(ctx, id, await input());
        for (const c of r.candidates) say(`  ${c.id} ${cmd} ${c.status}${c.error === undefined ? "" : ` · ${c.error}`}`);
        const failed = r.outcome !== undefined && !["done", "detached"].includes(r.outcome);
        if (json) doc({ ok: !failed, night: id, jobIds: r.jobIds, ...(r.outcome === undefined ? {} : { outcome: r.outcome }), ...(r.dry === true ? { dry: true } : {}), candidates: r.candidates });
        return failed ? 1 : 0;
      }

      // The kernel's genre and venture heads: listed, and retired by the operator (spark scout-vision S2).
      if (cmd === "genre" || cmd === "venture") {
        const { genresCommand } = await import("../lib/foundry/scout/genres.ts");
        const r = await genresCommand(cmd, pos.slice(1), { store: ctx.store, actor: ctx.actor });
        for (const l of r.lines) say(l);
        if (json) doc(r.doc);
        return r.code;
      }

      // A kept music seed made into a Suno track, and a kept track clip into a visualizer (spark scout-decision-graph).
      if (cmd === "track" || cmd === "visualizer") {
        const id = nightArg();
        // --collect: a detached job's results into the night - every pending track (visualizer) whose job is done.
        if (flags.has("collect")) {
          const got =
            cmd === "track"
              ? await (await import("../lib/foundry/scout/track.ts")).collectTracks(ctx, id, io.ports?.track ?? {})
              : await (await import("../lib/foundry/scout/visualizer.ts")).collectVisualizers(id);
          for (const c of got) say(`${c.id} ${c.kind} ${c.status}${c.error === undefined ? "" : ` · ${c.error}`}`);
          if (got.length === 0) say(`nothing to collect in night ${id}`);
          if (json) doc({ ok: true, night: id, candidates: got });
          return 0;
        }
        const r =
          cmd === "track"
            ? await (await import("../lib/foundry/scout/track.ts")).trackAct(ctx, id, str("seed") ?? usage("track needs --seed <batch>/sd-NNN"), io.ports?.track ?? {})
            : await (await import("../lib/foundry/scout/visualizer.ts")).visualizerAct(ctx, id, str("track") ?? usage("visualizer needs --track <night>/<c-id>/<aN>"), io.ports?.visualizer ?? {});
        const c = r.candidate;
        const failed = c.status === "failed" || (r.outcome !== undefined && !["done", "detached", "enqueued", "launched", "queued", "running"].includes(r.outcome));
        say(`${c.id} ${c.kind} ${c.status}${r.outcome === undefined ? "" : ` · ${r.outcome}`}${c.error === undefined ? "" : ` · ${c.error}`}`);
        if (json) doc({ ok: !failed, night: id, candidate: c, ...(r.outcome === undefined ? {} : { outcome: r.outcome }), budget: acts.money(ctx, await store.readNight(id)) });
        return failed ? 1 : 0;
      }

      if (cmd === "style" || cmd === "scene") {
        const id = nightArg();
        // --use: what content the run can serve, one line. A run launched without one says so on the Board.
        const use = str("use")?.trim();
        if (use !== undefined && (use === "" || use.length > USE_MAX)) usage(`--use is one line of at most ${USE_MAX} characters: the content this run can help make`);
        const r =
          cmd === "style"
            ? await acts.styleAct(ctx, id, list("sources").length > 0 ? list("sources") : usage("style needs --sources s-01,s-03"), str("slug"), use, str("seed"))
            : await acts.sceneAct(ctx, id, str("source") ?? usage("scene needs --source s-NN"), flags.has("frames") ? list("frames") : undefined, use, str("seed"));
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
  const code = await runCli(args, { env: process.env, out: (s) => console.log(s), err: (s) => console.error(s) });
  // The studio's CDP socket (lib/imaging/studio/browser.ts) is never closed - closing it closes the
  // operator's Chrome - and it keeps node alive after the doctor's studio line or an `ideas` batch
  // (2026-10-23: a doctor that printed nothing and never exited). Leave once stdout has drained.
  process.stdout.write("", () => process.exit(code));
}
