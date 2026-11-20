// WHAT THE CLI LEAVES FOR A REEL'S THREE STOPS, and what it reads back from them. The stops are decided on the
// Board (lib/decision/v1/sources/reel.ts): the card `data` drew (./card.mts), the sheet `proof` tiles here, the
// cut. This CLI never writes a verdict - <dir>/verdicts.json is the Board's apply's alone (lib/reel/store.ts) -
// and a MISSING verdict never stops a verb: the Board is not required to run the CLI. One recorded verdict does
// stop one verb: a proof the operator rejected is not cut until its frames are shot again.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { readVerdicts, type ReelVerdict, type StopKey } from "../../lib/reel/store";
import { ReelError, type ReelCut, type ReelIdea, type ReelTable } from "../../lib/reel/types";
import { ffmpegTo } from "../strips/deadline.mts";

const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
const SHEET_MS = 60_000;

export const sheetFile = (dir: string, cut: ReelCut): string => path.join(dir, cut, "proof", "sheet.png");

/** A proof that is being shot again has no sheet until it passes: the frames in the folder are not the ones a sheet would claim. */
export const dropSheet = (dir: string, cut: ReelCut): Promise<void> => rm(sheetFile(dir, cut), { force: true });

/** The twelve proof frames as one picture, 4 x 3 in the order they were shot (the tile the strips' own sheet uses). */
export async function proofSheet(dir: string, cut: ReelCut, frames: readonly string[], lane: "stat" | "edu"): Promise<string> {
  const file = sheetFile(dir, cut);
  const cell = lane === "edu" ? "480:-2" : "270:-2";
  const inputs = frames.flatMap((f) => ["-i", f]);
  const graph = `${frames.map((_, k) => `[${k}:v]`).join("")}concat=n=${frames.length}:v=1:a=0,scale=${cell},tile=4x3:padding=6:color=0x111111`;
  await ffmpegTo([...inputs, "-filter_complex", graph, "-frames:v", "1", "-update", "1"], file, SHEET_MS);
  return file;
}

const TITLE_MAX = 100;
const TAGS_MAX = 8;
/** Words that say nothing about a reel as a tag. */
const STOP_WORDS = new Set(["the", "and", "for", "from", "with", "who", "has", "have", "most", "every", "what", "which", "how", "many", "much", "was", "are", "won", "all", "its", "that", "this", "than", "into", "over", "one", "two", "per"]);

/** The words a slot would carry, defaulted from the idea and the table's source line: a title a platform takes, a description that names the source and its licence, three to eight tags. */
export function defaultPublish(idea: ReelIdea, table: Pick<ReelTable, "unit" | "granularity" | "source">, cut: ReelCut): { title: string; description: string; tags: string[] } {
  const title = idea.title.trim().replace(/[<>]/g, "").slice(0, TITLE_MAX);
  const description = [idea.hook.trim(), "", `Source: ${table.source.name} (${table.source.url})`, `Licence: ${table.source.licence}`, `Data as of ${table.source.fetchedAt}.`].join("\n").replace(/[<>]/g, "");
  const words = `${idea.title} ${table.unit}`.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  const tags = [...new Set([...words.filter((w) => !STOP_WORDS.has(w)), "data visualization", cut === "short" ? "shorts" : "bar chart race", "statistics"])].slice(0, TAGS_MAX);
  return { title, description, tags };
}

/** `<cut>/publish.json`, written ONCE: after that the words are the operator's, and a second `cut` leaves them alone. */
export async function ensurePublish(dir: string, cut: ReelCut, idea: ReelIdea, table: ReelTable): Promise<string> {
  const file = path.join(dir, cut, "publish.json");
  if (!existsSync(file)) await writeFile(file, `${JSON.stringify(defaultPublish(idea, table, cut), null, 2)}\n`, { flag: "wx" }).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "EEXIST") throw e;
  });
  return file;
}

const words = (v: ReelVerdict): string => `${v.verdict}${v.reasons.length === 0 ? "" : ` (${v.reasons.join(", ")})`}${v.note === undefined ? "" : `: ${v.note.replace(/\s+/g, " ")}`}`;

/** The recorded verdicts by stop, as `status` prints them. */
export async function recordedVerdicts(dir: string): Promise<Partial<Record<StopKey, string>>> {
  const { stops } = await readVerdicts(dir);
  return Object.fromEntries(Object.entries(stops).map(([k, v]) => [k, `${words(v)} · ${v.by}, ${v.at}${v.round > 1 ? ` · round ${v.round}` : ""}`]));
}

/**
 * Refuse `cut` while the operator's REJECT of this cut's proof still stands. A verdict is of the sheet that was
 * judged (lib/reel/store.ts `of`): once `proof` has shot the frames again the sheet is other bytes, the reject is
 * about a proof that no longer exists, and the cut goes ahead.
 */
export async function refuseRejectedProof(dir: string, cut: ReelCut): Promise<void> {
  const v = (await readVerdicts(dir)).stops[`${cut}:proof`];
  if (v === undefined || v.verdict !== "reject") return;
  const file = sheetFile(dir, cut);
  if (existsSync(file) && sha(await readFile(file)) !== v.of) return;
  throw new ReelError(`the ${cut} proof was rejected on the Board - ${words(v)}: fix the page and run \`proof ${dir} ${cut}\` again before cutting`);
}
