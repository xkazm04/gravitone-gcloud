// The music-video producer tests' world: fake engines that count every call and
// can tell a re-spend (a vendor asked for an output the record already holds),
// a folder of tiny "mp3"s, and a kernel opened on a file of the test's own.
// Nothing here decodes audio, opens a browser or reaches a vendor.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readMv } from "../../lib/sound/mv/store.ts";
import { standText } from "../../lib/sound/mv/standIns.ts";
import type { MvEngines } from "../../lib/sound/mv/steps.ts";
import type { MvAnalysis, MvJob } from "../../lib/sound/mv/types.ts";
import type { TextRequest, TextResult } from "../../lib/text/types.ts";

export const ANALYSIS: MvAnalysis = {
  durationS: 95,
  tempoBpm: [120, 60],
  energyShape: [0.2, 0.3, 0.5, 0.6, 0.8, 0.9, 0.7, 0.5, 0.3, 0.1],
  sections: [
    { startS: 0.4, label: "Intro" },
    { startS: 20, label: "Verse" },
    { startS: 50, label: "Chorus" },
    { startS: 80, label: "Outro" },
  ],
};

export type Calls = { analyse: number; render: number; still: number; treat: number; motion: number; metadata: number; fetchClip: number; respent: string[] };

/** What the treatment turn costs when the fake reports one (USD); the metadata turn reports none. */
export const TREAT_USD = 0.02;

/** The record the fakes are working for, as mv.json has it now (one record per world). */
async function current(): Promise<MvJob | undefined> {
  return (await readMv()).jobs.find((j) => j.state === "active");
}

export function mvFakes(opts: { hold?: () => Promise<void>; stillEntered?: () => void; calls?: Calls; tag?: string } = {}): { calls: Calls; engines: Partial<MvEngines> } {
  // A restarted process keeps counting into the same tally: a re-spend is a re-spend across restarts.
  const calls: Calls = opts.calls ?? { analyse: 0, render: 0, still: 0, treat: 0, motion: 0, metadata: 0, fetchClip: 0, respent: [] };
  const answer = (req: TextRequest, json: unknown, usd?: number): TextResult => {
    const base = standText(req);
    return { ...base, text: JSON.stringify(json), json, provenance: usd === undefined ? base.provenance : { ...base.provenance, costUsd: usd, costBasis: "vendor-reported" } };
  };
  const engines: Partial<MvEngines> = {
    analyse: async ({ envelopePath }) => {
      calls.analyse++;
      writeFileSync(envelopePath, "{}");
      return structuredClone(ANALYSIS);
    },
    render: async ({ outPath }) => {
      calls.render++;
      writeFileSync(outPath, `video #${calls.render}`);
      return { durationS: 95 };
    },
    still: async () => {
      calls.still++;
      const j = await current();
      // A first run asking for a still the record already holds is a still bought twice.
      if (j !== undefined && j.files.still !== undefined && j.redo === undefined) calls.respent.push(`still for ${j.id}`);
      opts.stillEntered?.();
      if (opts.hold !== undefined) await opts.hold();
      return { bytes: new Uint8Array(Buffer.from(`jpeg ${opts.tag ?? ""}#${calls.still}`)), mime: "image/jpeg" };
    },
    fetchClip: async () => {
      calls.fetchClip++;
      return new Uint8Array(Buffer.from("clip-bytes"));
    },
    health: async () => ({ ok: true }),
    reason: async (req: TextRequest): Promise<TextResult> => {
      const j = await current();
      const required = (req.schema as { required?: unknown } | undefined)?.required;
      if (req.turn === "mv-metadata") {
        calls.metadata++;
        if (j?.metadata !== undefined && j.redo === undefined) calls.respent.push(`metadata for ${j.id}`);
        return answer(req, { title: `ambient visualizer, take ${calls.metadata}`, description: "A slow track that builds and falls away.", tags: ["ambient", "visualizer", "slow"] });
      }
      if (Array.isArray(required) && required.length === 1 && required[0] === "motion") {
        calls.motion++;
        return answer(req, { motion: { particleDensity: 0.3, particleHue: 40, pulseStrength: 0.4 } });
      }
      calls.treat++;
      if (j?.treatment !== undefined && j.redo === undefined) calls.respent.push(`treatment for ${j.id}`);
      return answer(req, { prompt: `matte painted dusk valley, version ${calls.treat}`, motion: { particleDensity: 0.5, particleHue: 210, pulseStrength: 0.6 }, rationale: "a quiet valley" }, TREAT_USD);
    },
  };
  return { calls, engines };
}

/** A folder of tiny "mp3"s - createTake reads the type off the extension and nothing decodes audio. */
export function audioDir(root: string, names: readonly string[]): string {
  const dir = path.join(root, "music", String(Date.now() + Math.random()));
  mkdirSync(dir, { recursive: true });
  names.forEach((n, i) => writeFileSync(path.join(dir, n), `ID3 fake audio ${i} ${n}`));
  return dir;
}
