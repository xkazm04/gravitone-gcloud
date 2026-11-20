// PRODUCTIONS INTO THE PROJECTION (spark device-metadata-sync, KS1) - `knowhow/productions/<id>.json`: the graph as the
// owning device holds it, without bytes. Each node keeps its station, label, state, what it was made from, its prompt,
// verdict, drift and place on the clock; its media becomes a hash and a logical path. The `failed` log sentences and
// `styled` URLs stay home: they are machine facts (the cores' styled pictures travel on the character instead).
//
// A production file another device owns is never overwritten here: productions are a one-way mirror from their owner.

import { existsSync } from "node:fs";

import { isForeign, knowhowPaths, type Device, type KnowhowProduction, type MediaRef } from "@gt/domain/knowhow";
import type { ProductionNode } from "@gt/domain/productionGraph";

import { fileOfUrl, readState, statePath } from "../production/state.ts";
import { explainMediaRef } from "./media.ts";
import { fileOf, put, readRecord, serialize, type ExportSummary } from "./write.ts";

type Node = KnowhowProduction["nodes"][number];

function nodeOf(n: ProductionNode, refused: (why: string) => void): Node {
  let media: MediaRef | undefined;
  if (n.media !== undefined) {
    const abs = fileOfUrl(n.media.src);
    if (abs !== null) {
      const r = explainMediaRef(abs, n.media.kind);
      if (r.ok) media = r.value;
      else if (r.error.code !== "not-found") refused(`${n.id}: ${r.error.message}`);
    }
  }
  return {
    id: n.id,
    station: n.station,
    label: n.label,
    state: n.state,
    madeFrom: [...n.madeFrom],
    ...(n.prompt === undefined ? {} : { prompt: n.prompt }),
    ...(n.verdict === undefined ? {} : { verdict: { verdict: n.verdict.verdict, reasons: [...n.verdict.reasons], ...(n.verdict.note === undefined ? {} : { note: n.verdict.note }) } }),
    ...(n.drift === undefined ? {} : { drift: { identity: n.drift.identity, room: n.drift.room, wardrobe: n.drift.wardrobe, reason: n.drift.reason, by: n.drift.by } }),
    ...(n.at === undefined ? {} : { at: n.at }),
    ...(n.dur === undefined ? {} : { dur: n.dur }),
    ...(media === undefined ? {} : { media }),
  };
}

/** One production's state file into its know-how file. */
export function exportProduction(s: ExportSummary, self: Device, id: string, dry: boolean): void {
  if (!existsSync(statePath(id))) {
    s.refused.push({ id, reason: `no production state ${id} on this device` });
    return;
  }
  const st = readState(id);
  if (!st.ok) {
    s.refused.push({ id, reason: st.error.message });
    return;
  }
  // Another device's production, mirrored here by the import: its owner exports it, never this device.
  if (st.value.readOnly === true) return;
  const p = st.value.production;
  const contract = knowhowPaths.production(p.id);
  const held = readRecord(fileOf(contract));
  const owner = typeof held?.["owner"] === "string" ? held["owner"] : self.id;
  if (isForeign(owner, self.id)) {
    s.refused.push({ id: p.id, reason: `${p.title} belongs to another device (${owner}); its know-how is read-only here` });
    return;
  }
  const nodes = p.nodes.map((n) => nodeOf(n, (why) => s.refused.push({ id: `${p.id}/${n.id}`, reason: why })));
  const body = { title: p.title, look: p.look, cast: p.cast.id, nodes };
  const was = held === undefined ? null : { title: held["title"], look: held["look"], cast: held["cast"], nodes: held["nodes"] };
  const at = was !== null && typeof held?.["at"] === "string" && serialize(was) === serialize(body) ? held["at"] : new Date().toISOString();
  const record: KnowhowProduction = { v: 1, id: p.id, owner, ownerName: self.name, at, ...body };
  put(s, p.id, contract, record, { dry });
}
