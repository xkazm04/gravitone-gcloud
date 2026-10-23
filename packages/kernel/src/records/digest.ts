import type { ProjectPoster } from "@gt/domain/produce";
import type { Project } from "@gt/domain/project";
import { projectRecords } from "../parts/driver.ts";
import type { Reader } from "../store.ts";

// THE SHELF'S DIGEST - what a project holds, as the list draws it: a poster, the cut's runtime and
// the words a search matches. DERIVED at read from the project's own step records, inside the
// reader snapshot the list is assembled in; nothing here is stored, so it cannot describe a
// record that did not land (the v1 card kept a second copy in the same transaction as the write).
// A fact the records do not hold reads null, never 0 and never a default.

type Rec = Readonly<Record<string, unknown>>;

export type Digest = { readonly poster: ProjectPoster | null; readonly runtimeS: number | null; readonly text: string };

/** Per project: the list reads up to LIST_LIMIT of these in one snapshot. */
const TEXT_CAP = 4000;
const END_CARD_HOLD_S = 2;

const obj = (x: unknown): Rec | undefined => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Rec) : undefined);
const list = (x: unknown): readonly unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

function posterOf(blob: unknown): ProjectPoster | null {
  const b = obj(blob);
  const sha256 = str(b?.["sha256"]);
  const mime = str(b?.["mime"]);
  return sha256 === undefined || mime === undefined ? null : { sha256, mime };
}

/** The adopted still (album), else the first ready plate in unit order (film). */
function pictureOf(records: ReadonlyMap<string, Rec>): ProjectPoster | null {
  const still = records.get("still");
  const adopted = still?.["adopted"];
  const take = list(still?.["takes"]).map(obj).find((t) => t !== undefined && t["id"] === adopted);
  const fromStill = posterOf(take?.["blob"]);
  if (fromStill !== null) return fromStill;
  for (const u of list(records.get("frames")?.["units"])) {
    const plate = obj(obj(u)?.["plate"]);
    if (plate?.["state"] !== "ready") continue;
    const p = posterOf(plate["blob"]);
    if (p !== null) return p;
  }
  return null;
}

/** "m:ss" or "h:mm:ss" in seconds; null rather than a guess (lib/script/trailer/types.ts atSeconds). */
function secondsAt(at: unknown): number | null {
  if (typeof at !== "string") return null;
  const parts = at.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  let total = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    total = total * 60 + Number(p);
  }
  return total;
}

/** The trailer cut's last beat mark, or the picked ad scenario's shots and end card; else null. */
function runtimeOf(records: ReadonlyMap<string, Rec>): number | null {
  const beats = list(obj(records.get("script-trailer")?.["cut"])?.["beats"]);
  const last = obj(beats[beats.length - 1]);
  const trailer = last === undefined ? null : secondsAt(last["at"]);
  if (trailer !== null) return trailer;
  const scen = records.get("ads-scenarios");
  const picked = list(scen?.["options"]).map(obj).find((o) => o !== undefined && o["id"] === scen?.["pickedId"]);
  if (picked === undefined) return null;
  const shots = list(picked["shots"]).map((s) => obj(s)?.["durationS"]);
  if (shots.length === 0 || !shots.every((d): d is number => typeof d === "number")) return null;
  const hold = obj(records.get("ads-finish")?.["endCard"])?.["holdS"];
  const total = shots.reduce((a, d) => a + d, 0) + (typeof hold === "number" ? hold : END_CARD_HOLD_S);
  return Math.round(total * 10) / 10;
}

/** Every string a record holds, depth-first, until the budget is spent. */
function words(x: unknown, out: string[], budget: { left: number }): void {
  if (budget.left <= 0) return;
  if (typeof x === "string") {
    const t = x.trim();
    if (t.length < 3) return;
    out.push(t.slice(0, budget.left));
    budget.left -= t.length + 1;
  } else if (Array.isArray(x)) for (const v of x) words(v, out, budget);
  else if (typeof x === "object" && x !== null) for (const v of Object.values(x)) words(v, out, budget);
}

/** What a search matches: the project's own title and topic, then the notebook and the script it holds. */
function textOf(project: Project, records: ReadonlyMap<string, Rec>): string {
  const out: string[] = [project.title];
  const budget = { left: TEXT_CAP };
  if (project.topic !== undefined) out.push(project.topic);
  for (const key of ["research", "research-notebook", "ads-brief", "ads-ideas", "script-versions", "script-trailer", "ads-scenarios", "words", "article"]) {
    const rec = records.get(key);
    if (rec === undefined) continue;
    // The ledgers keep ids, digests and engine receipts beside the words; the words are `notebook`, `cut`, `candidates`, `options`, `brief`.
    const { v: _v, engine: _e, digest: _d, turn: _t, ...rest } = rec;
    void [_v, _e, _d, _t];
    words(rest, out, budget);
  }
  return out.join("\n").toLowerCase();
}

export function digestIn(r: Reader, project: Project): Digest {
  const { records } = projectRecords(r, project.id);
  const recs = records as ReadonlyMap<string, Rec>;
  return { poster: pictureOf(recs), runtimeS: runtimeOf(recs), text: textOf(project, recs) };
}
