// THE STUDIO'S FIXTURE RENDERS (spark audio-agent-studio, stage S1). The scripted sessions in
// app/(studio)/audio/studio/_port/fixtureSessions.ts point at real local renders through {{key}}
// tokens; this renders those takes through the local-band engine and writes the key -> take id index
// the fixture port resolves the tokens with.
//
//   SOUND_STORE_DIR=<dir> SOUND_LEDGER_PATH=<file> GRAVITONE_STORE_PATH=<file> npx tsx pipeline/studio-fixtures.mts [--json]
//
// $0: local renders only (Vital + the sample packs). It REFUSES without all three store variables, so
// it can never write into the operator's store. The index lands at <SOUND_STORE_DIR>/studio-fixtures.json.
import fs from "node:fs";
import path from "node:path";

import { swapRoleInstrument, type ScoreRole, type ScoreSpec } from "@gt/domain/audio.score";
import { templateById } from "@gt/domain/audio.score.templates";

import { auditionLocalInstrument, renderLocalScore } from "../lib/sound/localScore";
import { storeRoot } from "../lib/sound/store";

export const STUDIO_FIXTURE_INDEX = "studio-fixtures.json";

/** Every instrument a scripted session offers as a candidate (its "on its own" preview). */
const AUDITIONS = ["sample-mamas-bass", "vital-sub-bass", "sample-felt-piano", "sample-grand-piano", "sample-lofi-keys"] as const;

const swapped = (spec: ScoreSpec, role: ScoreRole, instrument: string, title: string): ScoreSpec => {
  const r = swapRoleInstrument(spec, role, instrument);
  if (!r.ok) throw new Error(`fixture ${title}: ${r.error.message}`);
  return { ...r.value, title };
};

/** Every take a scripted session names, by its {{key}}. */
function fixtureSpecs(): Readonly<Record<string, ScoreSpec>> {
  const calm = templateById("calm-bed").spec;
  const hiphop = templateById("chill-hiphop").spec;
  return {
    calm,
    "calm-vital-bass": swapped(calm, "bass", "vital-sub-bass", "Quiet Horizon Bed (smooth synth bass)"),
    hiphop,
    "hiphop-felt-piano": swapped(hiphop, "chords", "sample-felt-piano", "Midnight Study Loop (felt piano)"),
    synth: templateById("synthwave-pulse").spec,
  };
}

async function main(argv: readonly string[]): Promise<number> {
  const missing = ["SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "GRAVITONE_STORE_PATH"].filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    console.error(`studio-fixtures: refused - set ${missing.join(", ")} to a throwaway store (never the operator's)`);
    return 2;
  }
  const takes: Record<string, string> = {};
  for (const [key, spec] of Object.entries(fixtureSpecs())) {
    const t0 = Date.now();
    const r = await renderLocalScore(spec, { verifyDeterminism: false });
    if (!r.ok) {
      console.error(`studio-fixtures: ${key}: ${r.error.message}`);
      return 1;
    }
    // The engine falls back to a scipy stand-in when a sample path is missing and says so only in
    // `source`; a fixture labelled "felt piano" must not play a synth (.hackathon/instruments.local.json
    // or GRAVITONE_INSTRUMENTS_CONFIG names the sample folders).
    const standIns = r.value.plan.stems.filter((s) => s.source.startsWith("scipy")).map((s) => `${s.role} (${s.source})`);
    if (standIns.length > 0) {
      console.error(`studio-fixtures: ${key}: ${standIns.join(", ")} fell back to a synth stand-in - point GRAVITONE_INSTRUMENTS_CONFIG at the sample folders`);
      return 1;
    }
    takes[key] = r.value.take.id;
    if (!argv.includes("--json")) console.log(`${key.padEnd(18)} ${r.value.take.id}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  // The candidates' "on its own" audio is the file route's audition branch, which serves only what
  // auditionLocalInstrument rendered before (/api/sound/takes/audition/file?instrument=<id>).
  for (const id of AUDITIONS) {
    const r = await auditionLocalInstrument(id);
    if (!r.ok || r.value.source.startsWith("scipy")) {
      console.error(`studio-fixtures: audition ${id}: ${r.ok ? `fell back to ${r.value.source}` : r.error.message}`);
      return 1;
    }
    if (!argv.includes("--json")) console.log(`audition ${id.padEnd(20)} ${r.value.source}`);
  }
  const index = { v: 1, renderedAt: new Date().toISOString(), takes, auditions: AUDITIONS };
  const file = path.join(storeRoot(), STUDIO_FIXTURE_INDEX);
  fs.writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(argv.includes("--json") ? JSON.stringify({ ok: true, file, ...index }) : `index: ${file}`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
