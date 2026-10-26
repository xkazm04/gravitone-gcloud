import "server-only";

import type { BlobRef } from "@gt/domain/blob";
import { sha256Hex } from "@gt/kernel/canonical";
import type { RowWords } from "@gt/ui/board/port";

import { reelCell, reelCutCell, sourceLine } from "../../../foundry/scout/reelTaste.ts";
import type { Night, ReelCandidate, ReelCutCandidate } from "../../../foundry/scout/types.ts";
import type { Loss } from "../types.ts";
import type { Cell, ScoutV1 } from "./scoutPlan.ts";
import { scoutFileUrl } from "./scoutWing.ts";

// A REAL REEL AND A FULL CUT ON THE SCOUT PACKET (spark scout-vision S5) - pure, beside ./scoutPlan.ts whose `build`
// calls it (kept apart so that file does not grow past its bound).
//
//   reel      ONE image cell `c-NN/reel` under `reels` (the images tab): its tile, the strip's frame 120 - the 8 s strip
//             the operator approves before a full reel. The label is its title, the meta the source line verbatim, the
//             kept idea it is made from and its beats. Kept, a full reel is due (taste `## Reels to cut`); nothing else
//             is written. A dry reel has no tile: that cell as words.
//   reel-cut  ONE video cell `c-NN/video` under `reel cuts` (the videos tab): its mp4. Kept, it IS the output. A dry or
//             not-yet-rendered cut is that cell as words.
//
// A failed one is a Loss with its sentence verbatim, as every kind's is.

type Out = { readonly cells: Cell[]; readonly rows: RowWords[]; readonly losses: Loss[] };

/** What a reel's verdict does, as the preview says it. */
export const reelVerdictLine = (verdict: "keep" | "reject"): string => (verdict === "keep" ? "a full reel is due (30 s - 2 min)" : "refused: no full reel is cut from it");
/** What a cut's verdict does, as the preview says it. */
export const reelCutVerdictLine = (verdict: "keep" | "reject"): string => (verdict === "keep" ? "the full reel is kept" : "refused: the reel may be cut again");

/** A words cell's content address: ./scoutPlan.ts textRef's rule (imported there, so not imported back here). */
const textRef = (text: string): BlobRef => ({ sha256: sha256Hex(text), bytes: Buffer.byteLength(text, "utf8"), mime: "text/plain" });

const clip40 = (s: string): string => (s.length <= 40 ? s : `${s.slice(0, 39).replace(/\s+\S*$/, "")}…`);

function cell(night: Night, c: ReelCandidate | ReelCutCandidate, file: string | undefined, media: ScoutV1["media"], out: Out, id: string, meta: string, words: readonly string[]): void {
  const jobId = c.jobId ?? `scout:${night.id}`;
  const m = file === undefined ? undefined : media[file];
  if (file !== undefined && m === undefined) {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: `${file} is not on disk` });
    return;
  }
  if (file !== undefined && m !== undefined) out.cells.push({ id, candidate: c.id, kind: c.kind, row: c.id, jobId, media: m, grades: [], url: scoutFileUrl(night.id, file), words: { label: c.title, meta } });
  else {
    const body = words.join("\n");
    out.cells.push({ id, candidate: c.id, kind: c.kind, row: c.id, jobId, media: textRef(body), grades: [], url: scoutFileUrl(night.id, "night.json"), words: { label: c.title, meta, prompt: body } });
  }
}

export function reelCells(night: Night, c: ReelCandidate | ReelCutCandidate, media: ScoutV1["media"], out: Out): void {
  if (c.status === "failed") {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: c.error ?? "failed with no error recorded" });
    return;
  }
  const line = sourceLine(c.source);
  const use = c.use === undefined ? {} : { use: c.use };
  const aim = c.aim === undefined ? {} : { aim: c.aim };
  if (c.kind === "reel") {
    const meta = [line, `idea ${c.fromIdea}`, `${c.cut.length} beat${c.cut.length === 1 ? "" : "s"}`].join(" · ");
    cell(night, c, c.image, media, out, reelCell(c.id), meta, [`reel · ${c.title}`, line, ...c.cut.map((b) => `- ${b}`)]);
    out.rows.push({ id: c.id, label: clip40(c.title), group: "reels", prompt: c.cut.join(" / "), ...use, ...aim });
    return;
  }
  const meta = [line, `reel ${c.fromReel}`, `${c.seconds}s`].join(" · ");
  cell(night, c, c.video, media, out, reelCutCell(c.id), meta, [`reel cut · ${c.title}`, line, `${c.seconds}s from reel ${c.fromReel}`]);
  out.rows.push({ id: c.id, label: clip40(c.title), group: "reel cuts", ...use, ...aim });
}
