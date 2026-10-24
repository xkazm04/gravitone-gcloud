// SOUND TRIAGE - every take in the sound store, triaged by the audio sidecar against its own brief.
//
//   npx tsx pipeline/sound-triage.mts [--all] [--json]
//
// Without --all only takes nobody has judged yet; with it, every take that has a file. Each take is
// hashed the way the Board hashes it (lib/decision/v1/types.ts mediaRef) and judged against
// lib/sound/triageContext.ts triageContextOf - the same brief the media-facts pass uses - so a row
// written here is the row the Board's audio line reads.
//
// TWO WRITES. (1) `<sound store>/triage.json` - { takeId: { sha, contextDigest, triage, at } }, the
// record the agreement report (pipeline/audio-triage-agreement.mts) reads beside the verdicts.
// (2) The kernel's audio_triage table (packages/kernel/src/library/triage.ts putTriage) - ONLY when
// GRAVITONE_STORE_PATH is set explicitly: a script never opens the operator's default store
// (CLAUDE.md "the store"); in the operator's own app the media-facts pass fills that table.
//
// Exit 0 ok (findings may still flag - triage names evidence, it never fails a take) · 1 the sidecar
// is unavailable or a store could not be read/written · 2 usage.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { triageDigest, putTriage, type TriageRow } from "@gt/kernel/library/triage";
import { processKernel } from "@gt/kernel/process";
import type { Triage } from "@gt/domain/audio.triage";

import { sidecarDoctor, triageFile } from "../lib/audio/sidecar.ts";
import { mediaRef } from "../lib/decision/v1/types.ts";
import { filePathAbs, readTakes, storeRoot } from "../lib/sound/store.ts";
import { triageContextOf } from "../lib/sound/triageContext.ts";

export type TriageRecord = { readonly sha: string; readonly contextDigest: string; readonly triage: Triage; readonly at: string };
export const TRIAGE_FILE = "triage.json";

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const JSON_OUT = args.includes("--json");
const unknown = args.filter((a) => a !== "--all" && a !== "--json");
if (unknown.length > 0) {
  console.error(`usage: npx tsx pipeline/sound-triage.mts [--all] [--json]  (unknown: ${unknown.join(" ")})`);
  process.exit(2);
}

async function main(): Promise<number> {
  const doctor = await sidecarDoctor();
  if (!doctor.ok) {
    console.error(doctor.error.message);
    return 1;
  }
  const takes = (await readTakes()).takes.filter((t) => t.file !== null && t.origin !== "fixture" && (ALL || t.verdict === "unjudged"));
  const file = path.join(storeRoot(), TRIAGE_FILE);
  let held: Record<string, TriageRecord> = {};
  try {
    held = JSON.parse(await readFile(file, "utf8")) as Record<string, TriageRecord>;
  } catch {
    held = {};
  }
  const rows: TriageRow[] = [];
  const failed: string[] = [];
  for (const t of takes) {
    const abs = filePathAbs(t.file?.path ?? "");
    const ref = await mediaRef(abs);
    if (!ref.ok) {
      failed.push(`${t.id}: ${ref.error.message}`);
      continue;
    }
    const context = triageContextOf(t);
    const r = await triageFile(abs, context);
    if (!r.ok) {
      failed.push(`${t.id}: ${r.error.message}`);
      continue;
    }
    const rec: TriageRecord = { sha: ref.value.sha256, contextDigest: triageDigest(context), triage: r.value, at: new Date().toISOString() };
    held[t.id] = rec;
    rows.push({ sha: rec.sha, contextDigest: rec.contextDigest, triage: rec.triage, at: rec.at });
    if (!JSON_OUT) console.log(`  ${t.id}  ${t.kind.padEnd(5)} ${String(r.value.flagged).padStart(2)} flagged  ${t.title}`);
  }
  await writeFile(file, JSON.stringify(held, null, 2), "utf8");
  let kernel = "not written (GRAVITONE_STORE_PATH unset - the operator's store is never opened by a script)";
  const at = process.env["GRAVITONE_STORE_PATH"]?.trim();
  if (at !== undefined && at !== "" && rows.length > 0) {
    const k = processKernel(path.resolve(at));
    if (!k.ok) {
      console.error(`kernel: ${k.error.message}`);
      return 1;
    }
    const put = putTriage(k.value.store, rows);
    if (!put.ok) {
      console.error(`kernel: ${put.error.message}`);
      return 1;
    }
    kernel = `${put.value} row(s) in ${at}`;
  }
  const summary = { triaged: rows.length, failed, file, kernel };
  if (JSON_OUT) console.log(JSON.stringify(summary));
  else console.log(`triaged ${rows.length} take(s); ${failed.length} failed; ${file}; kernel: ${kernel}${failed.length ? `\n  ${failed.join("\n  ")}` : ""}`);
  return failed.length > 0 && rows.length === 0 ? 1 : 0;
}

process.exit(await main());
