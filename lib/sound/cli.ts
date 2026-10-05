// The sound CLI's verbs, as a function — pipeline/sound.mts is the shim that
// loads the environment and calls this. Server-only.
//
// WHY A FUNCTION AND NOT THE SCRIPT ITSELF. The CLI is the agents' contract
// (`finalized --json` is how an agent picks a track), so it is probed — and a
// probe that spawned `npx tsx` would need tsx installed and the network to
// fetch it, which the offline node lane does not have. So the verbs live here,
// take their argv and two writers, and return an exit code; the probe calls
// this in-process against a temp store (tests/golden-path/sound-store.probe.spec.ts)
// and the script calls it for real. Nothing here calls process.exit.
//
// Exit codes: 0 ok · 1 the operation failed · 2 usage.

import fs from "node:fs";
import path from "node:path";

import { generateTake, parseGenerateRequest } from "./generate";
import { renderParams, renderPatterns } from "./knowledge";
import { ledgerPath, readLedger, SoundError, storeRoot } from "./store";
import { listTakes, parseTakeFilter, parseTakePatch, patchTake } from "./takes";
import { RUBRIC, STAGES, type SoundTake } from "./types";

export const USAGE =
  "usage: npx tsx pipeline/sound.mts <list|generate|judge|finalized|lessons|knowledge> [--json]\n" +
  "  list [--kind] [--verdict] [--stage] [--provider] [--origin] [--fixtures]\n" +
  "  generate --kind music|sfx --prompt <p> --duration <s> [--op compose|plan|sfx] [--technique a,b] [--negative n]\n" +
  "           [--genre a,b] [--mood a,b] [--instrument a,b] [--category c] [--loop] [--influence 0..1] [--tempo n] [--key k] [--title t]\n" +
  "  judge <id> --verdict kept|rejected|unjudged [--score dim=n,...] [--reasons a,b] [--note t] [--stage s|none] [--group g] [--label l]\n" +
  "  finalized [--kind] [--group] [--label]      lessons [--kind]      knowledge [--check]";

class Usage extends Error {}

export interface CliIO {
  /** The repo root: knowledge/audio is written under it. */
  root: string;
  out: (line: string) => void;
  err: (line: string) => void;
}

const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(v));
const KINDS = ["music", "sfx"] as const;

export async function runSoundCli(argv: readonly string[], io: CliIO): Promise<number> {
  const JSON_OUT = argv.includes("--json");
  const args = argv.filter((a) => a !== "--json");
  const cmd = args[0];
  const json = (v: unknown) => io.out(JSON.stringify(v, null, 2));

  const flag = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return undefined;
    const v = args[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Usage(`--${name} needs a value`);
    return v;
  };
  const has = (name: string) => args.includes(`--${name}`);
  const list = (name: string) =>
    (flag(name) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const kindFlag = () => {
    const k = flag("kind");
    if (k === undefined) return null;
    if (k !== "music" && k !== "sfx") throw new Usage("--kind must be music or sfx");
    return k;
  };
  const printTakes = (takes: SoundTake[]) => {
    if (!takes.length) return io.out("  (no takes)");
    for (const t of takes)
      io.out(
        `  ${pad(t.id, 16)} ${pad(t.kind, 5)} ${pad(t.verdict, 9)} ${pad(dash(t.stage), 10)} ${pad(t.provider, 10)} ${pad(t.origin, 11)} ${pad(t.title, 34)}${t.label ? `  [${t.label}]` : ""}`,
      );
  };

  try {
    switch (cmd) {
      case "list": {
        const query = new URLSearchParams();
        for (const k of ["kind", "verdict", "stage", "provider", "origin"]) {
          const v = flag(k);
          if (v) query.set(k, v);
        }
        if (has("fixtures")) query.set("fixtures", "1");
        const takes = await listTakes(parseTakeFilter(query));
        if (JSON_OUT) json({ takes });
        else printTakes(takes);
        break;
      }
      case "generate": {
        const kind = kindFlag();
        if (!kind) throw new Usage("--kind is required");
        const prompt = flag("prompt");
        if (!prompt) throw new Usage("--prompt is required");
        const duration = flag("duration");
        if (!duration) throw new Usage("--duration is required (seconds)");
        const req = parseGenerateRequest({
          kind,
          provider: "elevenlabs",
          op: flag("op") ?? (kind === "sfx" ? "sfx" : "compose"),
          prompt,
          negative: flag("negative") ?? null,
          durationS: Number(duration),
          loop: kind === "sfx" ? has("loop") : null,
          promptInfluence: flag("influence") !== undefined ? Number(flag("influence")) : null,
          technique: list("technique"),
          terms: { genre: list("genre"), mood: list("mood"), instrument: list("instrument"), sfxCategory: flag("category") ?? null },
          tempoBpm: flag("tempo") ? Number(flag("tempo")) : null,
          key: flag("key") ?? null,
          // THE AGENT LANE: a take generated from a terminal arrives in Triage
          // as an agent's, unjudged, for a person to hear.
          origin: "agent",
          sourceTakeId: null,
          editModes: null,
          plan: null,
          huntId: null,
          nodeId: null,
          title: flag("title") ?? null,
        });
        const take = await generateTake(req);
        if (JSON_OUT) json({ take });
        else {
          io.out(`filed ${take.id} — unjudged, waiting in Triage`);
          printTakes([take]);
        }
        break;
      }
      case "judge": {
        const id = args[1] && !args[1].startsWith("--") ? args[1] : null;
        if (!id) throw new Usage("judge needs a take id");
        const body: Record<string, unknown> = {};
        const v = flag("verdict");
        if (v) body.verdict = v;
        const score = flag("score");
        if (score) {
          const ratings: Record<string, number> = {};
          for (const pair of score.split(",")) {
            const [k, n] = pair.split("=").map((s) => s.trim());
            if (!k || !n || !Number.isFinite(Number(n)))
              throw new Usage(`--score takes dim=n pairs (dims: ${[...RUBRIC.music, ...RUBRIC.sfx].join(", ")})`);
            ratings[k] = Number(n);
          }
          body.ratings = ratings;
        }
        if (flag("reasons") !== undefined) body.reasons = list("reasons");
        if (flag("note") !== undefined) body.note = flag("note");
        const stage = flag("stage");
        if (stage !== undefined) {
          if (stage !== "none" && !(STAGES as readonly string[]).includes(stage)) throw new Usage(`--stage is one of ${STAGES.join(", ")} or none`);
          body.stage = stage === "none" ? null : stage;
        }
        if (flag("group") !== undefined) body.group = flag("group");
        if (flag("label") !== undefined) body.label = flag("label");
        if (!Object.keys(body).length) throw new Usage("judge needs at least one of --verdict --score --reasons --note --stage --group --label");
        const take = await patchTake(id, parseTakePatch(body));
        if (JSON_OUT) json({ take });
        else printTakes([take]);
        break;
      }
      case "finalized": {
        // How an agent picks a track: finalized, labelled, never a fixture.
        const takes = await listTakes({ kind: kindFlag(), stage: "finalized", group: flag("group") ?? null, label: flag("label") ?? null });
        if (JSON_OUT) json({ takes });
        else if (!takes.length) io.out("  (nothing finalized)");
        else
          for (const t of takes)
            io.out(`  ${pad(t.id, 16)} ${pad(t.kind, 5)} ${pad(t.label ?? "", 28)} ${pad(dash(t.group), 14)} ${pad(t.file ? t.file.path : "no file", 32)} ${pad(t.title, 30)}`);
        break;
      }
      case "lessons": {
        const kind = kindFlag();
        const { lessons } = await readLedger();
        const mine = lessons.filter((l) => !kind || l.kind === kind);
        if (JSON_OUT) json({ lessons: mine });
        else if (!mine.length) io.out("  (no lesson confirmed yet)");
        else for (const l of mine) io.out(`  ${pad(l.id, 14)} ${pad(l.kind, 5)} n=${pad(String(l.evidence.n), 4)} ${l.claim}`);
        break;
      }
      case "knowledge": {
        const ledger = await readLedger();
        const envDir = process.env.SOUND_KNOWLEDGE_DIR?.trim();
        const dir = envDir ? path.resolve(envDir) : path.join(io.root, "knowledge", "audio");
        const files: Record<string, string> = {
          "PATTERNS.md": renderPatterns(ledger),
          "params.json": `${JSON.stringify(renderParams(ledger), null, 2)}\n`,
        };
        const stale = Object.keys(files).filter((name) => {
          const at = path.join(dir, name);
          return !fs.existsSync(at) || fs.readFileSync(at, "utf8").replace(/\r\n/g, "\n") !== files[name];
        });
        const rel = path.relative(io.root, dir) || ".";
        if (has("check")) {
          if (JSON_OUT) json({ stale, dir: rel });
          else io.out(stale.length ? `stale: ${stale.join(", ")} — run \`npx tsx pipeline/sound.mts knowledge\`` : "knowledge/audio is current");
          return stale.length ? 1 : 0;
        }
        fs.mkdirSync(dir, { recursive: true });
        for (const name of stale) fs.writeFileSync(path.join(dir, name), files[name], "utf8");
        const p = renderParams(ledger);
        const summary = Object.fromEntries(
          KINDS.map((k) => [k, { judged: p.kinds[k].judged, strengths: p.kinds[k].strengths.length, belowFloor: p.kinds[k].belowFloor }]),
        ) as Record<(typeof KINDS)[number], { judged: number; strengths: number; belowFloor: number }>;
        if (JSON_OUT) json({ written: stale, dir: rel, kinds: summary, lessons: p.lessons.length });
        else {
          io.out(`${stale.length ? `wrote ${stale.join(", ")}` : "unchanged"} in ${rel}`);
          for (const k of KINDS)
            io.out(`  ${pad(k, 6)} judged ${summary[k].judged}, strengths ${summary[k].strengths} (n>=${p.min_n}), below floor ${summary[k].belowFloor}`);
          io.out(`  lessons ${p.lessons.length}`);
        }
        return 0;
      }
      default:
        throw new Usage(cmd ? `unknown command: ${cmd}` : "");
    }
  } catch (e) {
    if (e instanceof Usage) {
      if (JSON_OUT) json({ error: e.message || "usage" });
      else {
        if (e.message) io.err(`sound: ${e.message}\n`);
        io.err(USAGE);
      }
      return 2;
    }
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { kind?: string }).kind;
    if (JSON_OUT) json(code ? { error: msg, code } : { error: msg });
    else io.err(`sound: ${msg}`);
    return e instanceof SoundError && e.status === 400 ? 2 : 1;
  }
  if (!JSON_OUT) io.err(`(store: ${path.relative(io.root, storeRoot()) || "."} · ledger: ${path.relative(io.root, ledgerPath())})`);
  return 0;
}
