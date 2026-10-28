// LOCAL-SCORE — headless CLI for the deterministic local band engine (lib/sound/localScore.ts).
//
//   npx tsx pipeline/local-score.mts templates [--json]
//   npx tsx pipeline/local-score.mts receipt [--template chill-hiphop|calm-bed|synthwave-pulse|warm-acoustic] [--spec <file.json>]
//   npx tsx pipeline/local-score.mts render [--template chill-hiphop|calm-bed|synthwave-pulse|warm-acoustic] [--spec <file.json>] [--verify-determinism] [--json]
//   npx tsx pipeline/local-score.mts swap --take <id> --role drums|bass|chords|lead --instrument <id> [--muted] [--solo] [--json]
//   npx tsx pipeline/local-score.mts audition --instrument <id> [--json]
//
// Zero vendor spend ($0). Files takes into SOUND_STORE_DIR under provider "local".

import fs from "node:fs";
import path from "node:path";

import {
  INSTRUMENT_CATALOG,
  type ScoreRole,
  type StyleTemplateId,
} from "@gt/domain/audio.score";
import { WORKED_SCORE_TEMPLATES, templateById } from "@gt/domain/audio.score.templates";

import {
  auditionLocalInstrument,
  buildLocalScoreReceipt,
  renderLocalScore,
  swapLocalTakeStem,
} from "../lib/sound/localScore";
import { renderMidi } from "../lib/audio/sidecar";
import { ledgerPath, storeRoot } from "../lib/sound/store";

function flagOf(args: readonly string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? (args[i + 1] ?? null) : null;
}

function seedFixturesIfEmpty(): void {
  const dstRoot = storeRoot();
  const dstLedger = ledgerPath();
  const srcRoot = path.resolve(process.cwd(), "fixtures-out", "sound");
  const srcLedger = path.resolve(process.cwd(), "fixtures-out", "sound-ledger.json");
  if (!fs.existsSync(path.join(dstRoot, "takes.json")) && fs.existsSync(path.join(srcRoot, "takes.json"))) {
    fs.cpSync(srcRoot, dstRoot, { recursive: true });
  }
  if (!fs.existsSync(dstLedger) && fs.existsSync(srcLedger)) {
    fs.mkdirSync(path.dirname(dstLedger), { recursive: true });
    fs.copyFileSync(srcLedger, dstLedger);
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const cmd = argv[0] ?? "templates";

  if (cmd === "templates") {
    const payload = {
      templates: WORKED_SCORE_TEMPLATES.map((t) => ({
        id: t.id,
        label: t.label,
        plainIntent: t.plainIntent,
        tempoBpm: t.spec.tempoBpm,
        key: t.spec.key,
        tracks: t.spec.tracks.map((tr) => ({ role: tr.role, instrument: tr.instrument, pattern: tr.pattern })),
      })),
      instruments: INSTRUMENT_CATALOG,
    };
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  if (cmd === "receipt") {
    const specFile = flagOf(argv, "--spec");
    const templateId = (flagOf(argv, "--template") ?? "chill-hiphop") as StyleTemplateId;
    const rawSpec = specFile
      ? (JSON.parse(fs.readFileSync(path.resolve(specFile), "utf8")) as unknown)
      : templateById(templateId).spec;
    const res = buildLocalScoreReceipt(rawSpec);
    if (!res.ok) {
      console.error(JSON.stringify({ ok: false, error: res.error }, null, 2));
      return 1;
    }
    console.log(JSON.stringify({ ok: true, receipt: res.value }, null, 2));
    return 0;
  }

  if (cmd === "render") {
    if (argv.includes("--seed-fixtures")) seedFixturesIfEmpty();
    const specFile = flagOf(argv, "--spec");
    const templateId = (flagOf(argv, "--template") ?? "chill-hiphop") as StyleTemplateId;
    const verifyDeterminism = argv.includes("--verify-determinism");
    const rawSpec = specFile
      ? (JSON.parse(fs.readFileSync(path.resolve(specFile), "utf8")) as unknown)
      : templateById(templateId).spec;
    const res = await renderLocalScore(rawSpec, { verifyDeterminism });
    if (!res.ok) {
      console.error(JSON.stringify({ ok: false, error: res.error }, null, 2));
      return 1;
    }
    const { take, plan } = res.value;
    console.log(
      JSON.stringify(
        {
          ok: true,
          takeId: take.id,
          title: take.title,
          provider: take.provider,
          durationS: take.durationS,
          measured: take.measured,
          reusedRoles: plan.reusedRoles,
          renderedRoles: plan.renderedRoles,
          determinism: plan.determinism,
          triageFlagged: plan.triage.flagged,
          stems: plan.stems.map((s) => ({
            role: s.role,
            instrument: s.instrument,
            source: s.source,
            sha256: s.sha256,
            reused: s.reused,
            renderMs: s.renderMs,
          })),
          rppRel: plan.rppRel,
          costUsd: plan.costUsd,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (cmd === "swap") {
    const takeId = flagOf(argv, "--take");
    const role = flagOf(argv, "--role") as ScoreRole | null;
    const instrumentId = flagOf(argv, "--instrument");
    const muted = argv.includes("--muted") ? true : undefined;
    const solo = argv.includes("--solo") ? true : undefined;
    if (!takeId || !role || !instrumentId) {
      console.error(JSON.stringify({ ok: false, error: "swap requires --take <id> --role <role> --instrument <id>" }));
      return 2;
    }
    const res = await swapLocalTakeStem({
      takeId,
      role,
      instrumentId,
      ...(muted === undefined ? {} : { muted }),
      ...(solo === undefined ? {} : { solo }),
    });
    if (!res.ok) {
      console.error(JSON.stringify({ ok: false, error: res.error }, null, 2));
      return 1;
    }
    const { take, plan } = res.value;
    console.log(
      JSON.stringify(
        {
          ok: true,
          takeId: take.id,
          parentId: take.parentId,
          variation: take.variation,
          reusedRoles: plan.reusedRoles,
          renderedRoles: plan.renderedRoles,
          totalRenderMs: plan.totalRenderMs,
          measured: take.measured,
          triageFlagged: plan.triage.flagged,
          stems: plan.stems.map((s) => ({
            role: s.role,
            instrument: s.instrument,
            sha256: s.sha256,
            reused: s.reused,
            muted: s.muted,
            solo: s.solo,
            renderMs: s.renderMs,
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (cmd === "audition") {
    const instrumentId = flagOf(argv, "--instrument") ?? "";
    const res = await auditionLocalInstrument(instrumentId);
    if (!res.ok) {
      console.error(JSON.stringify({ ok: false, error: res.error }, null, 2));
      return 1;
    }
    console.log(JSON.stringify({ ok: true, ...res.value }, null, 2));
    return 0;
  }

  if (cmd === "render-midi" || cmd === "render-stem") {
    const midiFile = flagOf(argv, "--midi");
    const instrumentId = flagOf(argv, "--instrument");
    const outFile = flagOf(argv, "--out");
    if (!midiFile || !instrumentId || !outFile) {
      console.error(JSON.stringify({ ok: false, error: `${cmd} requires --midi <file.mid> --instrument <id> --out <out.wav>` }));
      return 2;
    }
    const res = await renderMidi(path.resolve(midiFile), instrumentId, path.resolve(outFile));
    if (!res.ok) {
      console.error(JSON.stringify({ ok: false, error: res.error }, null, 2));
      return 1;
    }
    console.log(JSON.stringify(res.value, null, 2));
    return 0;
  }

  console.error(JSON.stringify({ ok: false, error: `unknown subcommand: ${cmd}` }));
  return 2;
}

const code = await main(process.argv.slice(2));
process.exit(code);
