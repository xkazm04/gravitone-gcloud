// A PRODUCTION'S REVIEW ROUND AS A BOARD PACKET (spark character-cores WP3): the gallery side of the cut's review, so
// the existing cull (verdict mode, a note on every reject) opens a round of a production without a desk of its own.
// One run per clip, in clock order: its first keyframe (the take-start frame it was made from) and the clip itself,
// as two cells of one row. A verdict already on a node (the timeline's) arrives as that cell's decision.
//
// The packet's source is `scout`: the round lives on the scout canvas and judges a take by the scout's video axes
// (its `videos` group keys craft, motion, style). A `production` packet source would need its own v1 decision
// adapter in lib/decision/v1/registry.ts (the registry is checked against PACKET_SOURCES), which is S2's, with the
// kernel's production manifest. The blob refs are the fixture's: the kernel mints a digest when it stores the bytes
// (S2); until then the cell's `url` is the address and the digest is zero, as /kit's packets are.

import type { DecisionView, ViewItem } from "@gt/domain/board";
import { err, ok, type Result } from "@gt/domain/errors";
import type { CandidateId, PacketId } from "@gt/domain/ids";
import type { Production, ProductionNode } from "@gt/domain/productionGraph";
import { reasonVocabulary } from "@gt/domain/source";

import type { BoardPacket, ItemWords, RowWords } from "./port.ts";
import { ROUND_GROUP, ROUND_SOURCE } from "./productionReasons.ts";

export { ROUND_GROUP } from "./productionReasons.ts";

const SOURCE = ROUND_SOURCE;
const ZERO = "0".repeat(64);

export const productionPacketId = (production: string, round: number | string): string => `pkt:production:${production}:${round}`;

const mimeOf = (kind: "image" | "video", src: string): string => {
  const ext = /\.([a-z0-9]+)(?=[?&#]|$)/i.exec(decodeURIComponent(src.split("path=")[1] ?? src))?.[1]?.toLowerCase();
  if (kind === "video") return ext === "webm" ? "video/webm" : "video/mp4";
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
};

/** The take-start keyframe a clip was made from: the first of its inputs that is a keyframe with a still. */
export function firstKeyframe(p: Production, clip: ProductionNode): ProductionNode | null {
  for (const id of clip.madeFrom) {
    const n = p.nodes.find((x) => x.id === id);
    if (n?.station === "keyframe" && n.media?.kind === "image") return n;
  }
  return null;
}

const take = (clip: ProductionNode): string => clip.id.replace(/^clip:/, "");
const secs = (t: number | undefined): string => (t === undefined ? "" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`);

/**
 * The id doors, the caller's: a branded id is minted only at a zod door (@gt/domain/ids), and zod never reaches a
 * module the browser can load (tests/next-gates/client-closure.test.ts), so the server hands its doors in -
 * `(s) => parseAt("production round", packetIdSchema, s)` and the candidate's twin.
 */
export type RoundDoors = { readonly packet: (id: string) => Result<PacketId>; readonly candidate: (id: string) => Result<CandidateId> };

/**
 * The round as a Board packet. `at` stamps the decisions the nodes already carry (a node's verdict holds no time of
 * its own). Refuses a production with no clip to review, and an id the doors refuse.
 */
export function productionRound(p: Production, round: number | string, at: string, doors: RoundDoors): Result<BoardPacket> {
  const clips = p.nodes.filter((n) => n.station === "clip" && n.media?.kind === "video").sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  if (clips.length === 0) return err("not-found", `${p.title} has no clip to review`);
  const id = doors.packet(productionPacketId(p.id, round));
  if (!id.ok) return id;

  const items: ViewItem[] = [];
  const words: Record<string, ItemWords> = {};
  const rows: RowWords[] = [];
  const decisions: DecisionView[] = [];
  for (const clip of clips) {
    const row = take(clip);
    const kf = firstKeyframe(p, clip);
    const cells: [string, ProductionNode, "image" | "video"][] = [...(kf === null ? [] : [[`${row}/start`, kf, "image"] as [string, ProductionNode, "image"]]), [`${row}/take`, clip, "video"]];
    for (const [cell, node, kind] of cells) {
      const cid = doors.candidate(cell);
      if (!cid.ok) return cid;
      const src = node.media?.src ?? "";
      items.push({ id: cid.value, row, url: src, media: { sha256: ZERO, bytes: 0, mime: mimeOf(kind, src) }, grades: [] });
      words[cell] = { label: kind === "image" ? node.label : `${row} take`, meta: kind === "image" ? `keyframe · ${secs(node.at)}` : `${secs(clip.at)} · ${(clip.dur ?? 0).toFixed(1)} s · ${clip.state}`, ...(node.prompt === undefined ? {} : { prompt: node.prompt }) };
      if (node.verdict !== undefined) {
        decisions.push({ key: `${id.value}::${cell}`, verdict: node.verdict.verdict, reasons: node.verdict.reasons, ...(node.verdict.note === undefined ? {} : { note: node.verdict.note }), rev: 0, by: "operator", surface: "timeline", at });
      }
    }
    rows.push({ id: row, label: `${row} · ${secs(clip.at)}`, group: ROUND_GROUP, ...(kf?.media === undefined ? {} : { poster: kf.media.src }), ...(clip.prompt === undefined ? {} : { prompt: clip.prompt }) });
  }
  const judged = new Set(decisions.map((d) => d.key));
  return ok({
    view: {
      id: id.value,
      lane: "video",
      source: SOURCE,
      mode: "matrix-cull",
      state: "open",
      title: `${p.title} · round ${round}`,
      rev: 0,
      items,
      decisions,
      undecided: items.filter((i) => !judged.has(`${id.value}::${i.id}`)).length,
      canUndo: false,
      reasons: reasonVocabulary(SOURCE),
      pairs: [],
    },
    present: { items: words, rows, meta: `${p.title} · cast ${p.cast.name} · ${clips.length} takes` },
  });
}
