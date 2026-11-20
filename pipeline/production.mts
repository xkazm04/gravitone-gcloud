// THE PRODUCTION, HEADLESS (spark character-cores S1.5, WP5) - every operation the canvas's production street does, from
// a terminal, on the same file the dev server reads (lib/production/state.ts), plus the real ones the street only
// queues: style a core in the production's look, redraw the stale keyframes with her, the eye's reading of them, and
// the H3 clip plan.
//
//   npx tsx pipeline/production.mts status <prod>                     the graph: per station, per state; styled cores; failures
//   npx tsx pipeline/production.mts cores                             the cores a production can cast
//   npx tsx pipeline/production.mts preview <prod> <core>             a swap's frames, stale set and redo
//   npx tsx pipeline/production.mts accept <prod> <core>              recast: everything downstream goes stale
//   npx tsx pipeline/production.mts verdict <prod> <node> keep|reject|clear [--reasons a,b] [--note "..."]
//   npx tsx pipeline/production.mts style <prod> <core> [--dry]       Codex: her portrait and sheet in the production's look
//   npx tsx pipeline/production.mts keyframes <prod> [--ids kf:K00,..] [--all] [--dry]   Codex: the stale keyframes with the cast
//   npx tsx pipeline/production.mts eye <prod> [--ids ..]             Fable 5.2: Drift on the cast's drawn keyframes
//   npx tsx pipeline/production.mts clips <prod> --dry                the H3 plan for the stale takes (never run here)
//   npx tsx pipeline/production.mts clip <prod> <clip:Kxx> <run> <path> [--prompt-file f]   a take rendered by
//                                                                     pipeline/production-clips.py: the clip made from it
//
// `--json` on every verb prints the answer as JSON. A core is `chr:sofia` or `sofia`. Exit 0 done, 1 refused or failed
// (the sentence printed), 2 usage. Codex and Claude run on the operator's seats; no vendor money is spent, and no store
// is opened (GRAVITONE_STORE_PATH is pointed at a temp file regardless). PRODUCTION_FIXTURE_DIR moves the whole root.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Result } from "../packages/domain/src/errors.ts";
import type { ProductionNode } from "../packages/domain/src/productionGraph.ts";
import { productionFixtureRoot } from "../lib/foundry/production/files.ts";
import { clipsPlan, keyframes, keyframesPlan, style, stylePlan, type DrawDone, type DrawPlan } from "../lib/production/draw.ts";
import { eye, type EyeRunner } from "../lib/production/eye.ts";
import { acceptSwap, getProduction, listCores, previewSwap, setClipMedia, setVerdict } from "../lib/production/ops.ts";
import { readState } from "../lib/production/state.ts";
import { codexImage } from "./trailer/codex.mts";

process.env["GRAVITONE_STORE_PATH"] ??= path.join(os.tmpdir(), `production-cli-${process.pid}.sqlite`);

const argv = process.argv.slice(2);
const VALUED = new Set(["--ids", "--reasons", "--note", "--prompt-file"]);
const pos: string[] = [];
const opt = new Map<string, string>();
const bools = new Set<string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i] as string;
  if (VALUED.has(a)) opt.set(a, argv[++i] ?? "");
  else if (a.startsWith("--")) bools.add(a);
  else pos.push(a);
}
const JSON_OUT = bools.has("--json");
const DRY = bools.has("--dry");
const list = (name: string): string[] | undefined => opt.get(name)?.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

const USAGE = "usage: production.mts status <prod> | cores | preview <prod> <core> | accept <prod> <core> | verdict <prod> <node> keep|reject|clear [--reasons a,b] [--note ..] | style <prod> <core> [--dry] | keyframes <prod> [--ids ..] [--all] [--dry] | eye <prod> [--ids ..] | clips <prod> --dry | clip <prod> <clip:Kxx> <run> <path> [--prompt-file f]   (--json on all)";

function usage(why?: string): never {
  console.error(why === undefined ? USAGE : `${why}\n${USAGE}`);
  process.exit(2);
}

function done<T>(r: Result<T>, human: (v: T) => string): never {
  if (!r.ok) {
    console.error(JSON_OUT ? JSON.stringify({ ok: false, code: r.error.code, error: r.error.message }) : r.error.message);
    process.exit(1);
  }
  console.log(JSON_OUT ? JSON.stringify({ ok: true, value: r.value }, null, 1) : human(r.value));
  process.exit(0);
}

const need = (i: number, what: string): string => pos[i] ?? usage(`missing ${what}`);

function planText(p: DrawPlan): string {
  const head = [`${p.verb} ${p.production} - ${p.core}: ${p.frames.length} frame(s)`];
  if (p.refusal !== undefined) head.push(`REFUSED on a real run: ${p.refusal}`);
  if (p.missing.length > 0) head.push(`missing refs: ${p.missing.join(", ")}`);
  const frames = p.frames.map((f) => [`- ${f.id} -> ${f.out}`, ...(f.source === undefined ? [] : [`  source: ${f.source}`]), ...f.refs.map((r, i) => `  image ${i + 1}: ${r}`), `  prompt: ${f.prompt}`].join("\n"));
  return [...head, ...frames].join("\n");
}

function drawText(d: DrawDone): string {
  return [`${d.plan.verb} ${d.plan.production} - ${d.plan.core}`, ...d.frames.map((f) => `- ${f.id}: ${f.ok ? "made" : `FAILED (${f.sentence ?? ""})`}${f.tries > 1 ? ` after ${f.tries} tries` : ""}`)].join("\n");
}

function drawExit(r: Result<DrawDone>): never {
  if (r.ok && r.value.frames.some((f) => !f.ok)) {
    if (!JSON_OUT) console.log(drawText(r.value));
    else console.log(JSON.stringify({ ok: false, value: r.value }, null, 1));
    process.exit(1);
  }
  return done(r, drawText);
}

const nodeLine = (n: ProductionNode): string => `${n.id} ${n.state}${n.media === undefined ? "" : ` ${n.media.src}`}${n.drift === undefined ? "" : ` [identity ${n.drift.identity}, room ${n.drift.room}, wardrobe ${n.drift.wardrobe}: ${n.drift.reason}]`}${n.verdict === undefined ? "" : ` (${n.verdict.verdict}${n.verdict.reasons.length > 0 ? `: ${n.verdict.reasons.join(", ")}` : ""})`}`;

/** Fable 5.2 on the operator's Claude seat, reading local images from the production root. */
const fable: EyeRunner = (prompt) =>
  new Promise((resolve) => {
    const out: Buffer[] = [];
    const errs: Buffer[] = [];
    const p = spawn("claude", ["-p", "--model", "claude-fable-5-2", "--allowedTools", "Read", "--", prompt], { cwd: productionFixtureRoot(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => p.kill(), 5 * 60_000);
    p.stdout.on("data", (b: Buffer) => out.push(b));
    p.stderr.on("data", (b: Buffer) => errs.push(b));
    p.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, sentence: e.message });
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      const reply = Buffer.concat(out).toString("utf8");
      resolve(code === 0 ? { ok: true, reply } : { ok: false, sentence: (Buffer.concat(errs).toString("utf8").trim() || reply.trim() || `claude exited ${String(code)}`).slice(0, 140) });
    });
  });

const draw = (dir: string, name: string, prompt: string, refs: string[]): Promise<boolean> => codexImage(dir, name, prompt, refs, 8 * 60_000);

const verb = pos[0];
switch (verb) {
  case "status": {
    const id = need(1, "production");
    const s = readState(id);
    done(s, (v) => {
      const p = getProduction(id);
      const nodes = p.ok ? p.value.nodes : v.production.nodes;
      const tally = new Map<string, number>();
      for (const n of nodes) tally.set(`${n.station} ${n.state}`, (tally.get(`${n.station} ${n.state}`) ?? 0) + 1);
      return [
        `${v.production.title} (${v.production.id}) - cast ${v.production.cast.name} (${v.production.cast.id})`,
        [...tally].map(([k, n]) => `${k}: ${n}`).join(" · "),
        ...Object.entries(v.styled).map(([c, st]) => `styled ${c}: ${st.sheet} (${st.at})`),
        ...Object.entries(v.failed).map(([k, why]) => `failed ${k}: ${why}`),
        ...nodes.filter((n) => n.station === "keyframe" || n.station === "clip").filter((n) => n.state !== "made" || n.drift !== undefined || n.verdict !== undefined).map(nodeLine),
      ].join("\n");
    });
    break;
  }
  case "cores":
    done(listCores(), (cs) => cs.map((c) => `${c.id} ${c.name}${c.sheet === undefined ? " (no sheet)" : ""} - ${c.origin}`).join("\n"));
    break;
  case "preview":
    done(previewSwap({ production: need(1, "production"), core: need(2, "core") }), (v) =>
      [`${v.from} -> ${v.to}: ${v.stale.length} stale; redo ${v.redo.keyframes.n} keyframes x ~${v.redo.keyframes.minEach} min, ${v.redo.clips.n} clips x ~${v.redo.clips.minEach} min, ${v.redo.cuts} cut`, ...v.frames.map(nodeLine)].join("\n"),
    );
    break;
  case "accept":
    done(acceptSwap({ production: need(1, "production"), core: need(2, "core") }), (v) => `${v.production.title} - cast ${v.production.cast.name}; ${v.production.nodes.filter((n) => n.state === "stale").length} stale`);
    break;
  case "verdict": {
    const v = need(3, "keep|reject|clear");
    if (v !== "keep" && v !== "reject" && v !== "clear") usage(`${v} is not keep, reject or clear`);
    const note = opt.get("--note");
    const node = need(2, "node");
    done(setVerdict({ production: need(1, "production"), node, verdict: v === "clear" ? null : v, reasons: list("--reasons") ?? [], ...(note === undefined ? {} : { note }) }), (r) => {
      const n = r.production.nodes.find((x) => x.id === node);
      return n === undefined ? node : nodeLine(n);
    });
    break;
  }
  case "style": {
    const prod = need(1, "production");
    const core = need(2, "core");
    if (DRY) done(stylePlan(prod, core), planText);
    drawExit(await style(prod, core, draw));
    break;
  }
  case "keyframes": {
    const prod = need(1, "production");
    const ids = list("--ids");
    const o = { ...(ids === undefined ? {} : { ids }), all: bools.has("--all") };
    if (DRY) done(keyframesPlan(prod, o), planText);
    drawExit(await keyframes(prod, o, draw));
    break;
  }
  case "eye": {
    const ids = list("--ids");
    const r = await eye(need(1, "production"), ids === undefined ? {} : { ids }, fable);
    const human = (rs: Awaited<ReturnType<typeof eye>> extends Result<infer T> ? T : never): string =>
      rs.map((x) => (x.ok ? `${x.id}: identity ${x.drift.identity}, room ${x.drift.room}, wardrobe ${x.drift.wardrobe} - ${x.drift.reason}` : `${x.id}: FAILED (${x.sentence})`)).join("\n");
    if (r.ok && r.value.some((x) => !x.ok)) {
      console.log(JSON_OUT ? JSON.stringify({ ok: false, value: r.value }, null, 1) : human(r.value));
      process.exit(1);
    }
    done(r, human);
    break;
  }
  case "clips": {
    const prod = need(1, "production");
    if (!DRY) usage("clips runs only as --dry: no clip renders from here");
    done(clipsPlan(prod), (v) =>
      [
        `H3 Ref2VA plan for ${v.production} - ${v.core}: ${v.clips.length} take(s), ~${v.minutes} min (~${(v.minutes / 60).toFixed(1)} h)`,
        ...(v.refusal === undefined ? [] : [`REFUSED on a real run: ${v.refusal}`]),
        ...v.clips.map((c) => `- ${c.take} (${c.clip}, ${c.seconds} s, ~${c.minutes} min)\n  start: ${c.start} [${c.startState}]\n  plate: ${c.plate ?? "none"}\n  sheet: ${c.sheet}`),
      ].join("\n"),
    );
    break;
  }
  case "clip": {
    const node = need(2, "clip node");
    const pf = opt.get("--prompt-file");
    const r = setClipMedia({ production: need(1, "production"), node, run: need(3, "run folder"), path: need(4, "path"), ...(pf === undefined ? {} : { prompt: readFileSync(pf, "utf8").trim() }) });
    done(r, (v) => {
      const n = v.production.nodes.find((x) => x.id === node);
      return n === undefined ? node : nodeLine(n);
    });
    break;
  }
  default:
    usage(verb === undefined ? undefined : `no verb ${verb}`);
}
