import "server-only";

// A folder of finished draws, named only by GRAVITONE_LOCAL_DRAWS. The path stays
// out of tracked source: this module reads whatever directory the env points at,
// and refuses a run id or a relative path that climbs out of it.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { FoundryError, containedIn } from "../runStore.ts";

const ENV = "GRAVITONE_LOCAL_DRAWS";

const SERVABLE = new Set([".png", ".jpg", ".jpeg", ".webp", ".mp4", ".webm"]);
const VIDEO = new Set([".mp4", ".webm"]);
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/** `nights/<id>` or a single run directory. No dots, so `..` cannot sneak through. */
const RUN_RE = /^(?:nights\/)?[A-Za-z0-9][A-Za-z0-9-]{0,40}$/;

export type DrawCard = {
  readonly key: string;
  readonly title: string;
  readonly via: string;
  readonly verdict: string;
  readonly follow: string;
  readonly anatomy: string;
  readonly notes: string;
  readonly frame: string;
  readonly clip: string;
  readonly prompt: string;
};

export type DrawRun = {
  readonly id: string;
  readonly at: string;
  readonly engine: string;
  readonly cards: readonly DrawCard[];
  /** Set when a closed desk night can be opened on the Board. The id, not a path. */
  readonly packet?: string;
};

export type DrawList =
  | { readonly kind: "unset" }
  | { readonly kind: "missing" }
  | { readonly kind: "ok"; readonly runs: readonly DrawRun[] };

type Judge = { follow?: string; anatomy?: string; notes?: string };
type Draw = { verdict?: string; error?: string | null; judge?: Judge | null; kept?: boolean; via?: string; rel?: string };
type Tier = { id?: string; name?: string; draws?: Draw[] };
type Report = { at?: string; engines?: { clip?: string }; tiers?: Tier[] };
type ManifestItem = {
  slug?: string; title?: string; style?: string; form?: string; tier?: string;
  verdict?: string; follow?: string; anatomy?: string; notes?: string; frame?: string; clip?: string;
};
type Manifest = { at?: string; engine?: string; items?: ManifestItem[] };

/** The env folder, absolute, or null when the operator has not named one. */
export function drawsRoot(): string | null {
  const v = process.env[ENV]?.trim();
  return v ? path.resolve(v) : null;
}

function pathsOf(tierId: string, draw: Draw): { frame: string; clip: string } {
  const via = draw.via ?? "";
  const home = (draw.rel ?? (via ? `tier-${tierId}/${via === "flux2" ? "" : via}`.replace(/\/$/, "") : "")).replace(/\\/g, "/");
  const shot = via === "flux2" && !draw.rel ? "still.png" : "frame.jpg";
  const frame = draw.kept && home ? `${home}/${shot}` : "";
  const clip = draw.kept && via && via !== "flux2" && home ? `${home}/clip.mp4` : "";
  return { frame, clip };
}

async function readPrompt(dir: string, frame: string, tierId: string, rel?: string): Promise<string> {
  const candidates = [
    rel ? path.join(dir, rel, "prompt.txt") : "",
    frame ? path.join(dir, path.dirname(frame), "prompt.txt") : "",
    path.join(dir, `tier-${tierId}`, "prompt.txt"),
  ].filter((p) => p !== "");
  for (const file of candidates) {
    try {
      return (await readFile(file, "utf8")).trim();
    } catch {
      /* the next candidate */
    }
  }
  return "";
}

async function fromReport(id: string, dir: string): Promise<DrawRun> {
  const report = JSON.parse(await readFile(path.join(dir, "report.json"), "utf8")) as Report;
  const cards: DrawCard[] = [];
  for (const tier of report.tiers ?? []) {
    const tierId = tier.id ?? "";
    for (const draw of tier.draws ?? []) {
      const via = draw.via ?? "";
      const located = pathsOf(tierId, draw);
      const frame = located.frame !== "" && (await hasFile(path.join(dir, located.frame))) ? located.frame : "";
      const clip = located.clip !== "" && (await hasFile(path.join(dir, located.clip))) ? located.clip : "";
      cards.push({
        key: `${tierId}-${via || cards.length}`,
        title: tier.name ? `${tierId} ${tier.name}` : tierId,
        via,
        verdict: draw.verdict ?? "",
        follow: draw.judge?.follow ?? "",
        anatomy: draw.judge?.anatomy ?? "",
        notes: draw.judge?.notes || draw.error || "",
        frame,
        clip,
        prompt: await readPrompt(dir, frame, tierId, draw.rel),
      });
    }
  }
  return { id, at: report.at ?? "", engine: report.engines?.clip ?? "", cards };
}

async function fromManifest(id: string, dir: string): Promise<DrawRun> {
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as Manifest;
  const cards: DrawCard[] = [];
  for (const item of manifest.items ?? []) {
    const locatedFrame = item.frame ?? "";
    const locatedClip = item.clip ?? "";
    const frame = locatedFrame !== "" && (await hasFile(path.join(dir, locatedFrame))) ? locatedFrame : "";
    const clip = locatedClip !== "" && (await hasFile(path.join(dir, locatedClip))) ? locatedClip : "";
    const rel = frame ? path.posix.dirname(frame) : "";
    cards.push({
      key: item.slug || String(cards.length),
      title: [item.title, item.style, item.form].filter(Boolean).join(" · "),
      via: item.tier ?? "",
      verdict: item.verdict ?? "",
      follow: item.follow ?? "",
      anatomy: item.anatomy ?? "",
      notes: item.notes ?? "",
      frame,
      clip,
      prompt: await readPrompt(dir, frame, item.tier ?? "", rel),
    });
  }
  return { id, at: manifest.at ?? "", engine: manifest.engine ?? "", cards };
}

async function packetId(dir: string): Promise<string | undefined> {
  try {
    const n = JSON.parse(await readFile(path.join(dir, "night.json"), "utf8")) as { id?: string; state?: string };
    if (n.id && (n.state === "closed" || n.state === "committed")) return n.id;
  } catch {
    /* a gallery with no desk manifest */
  }
  return undefined;
}

async function hasFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** Every run under the env folder: a directory with report.json, and each night with manifest.json. */
export async function listRuns(): Promise<DrawList> {
  const root = drawsRoot();
  if (!root) return { kind: "unset" };
  let names: string[];
  try {
    names = await readdir(root);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
    throw e;
  }
  const runs: DrawRun[] = [];
  for (const name of names.sort()) {
    const dir = path.join(root, name);
    let info;
    try {
      info = await stat(dir);
    } catch {
      continue;
    }
    if (!info.isDirectory()) continue;
    if (name === "nights") {
      let nights: string[] = [];
      try {
        nights = await readdir(dir);
      } catch {
        continue;
      }
      for (const night of nights.sort()) {
        const nd = path.join(dir, night);
        if (await hasFile(path.join(nd, "manifest.json"))) {
          const run = await fromManifest(`nights/${night}`, nd);
          const packet = await packetId(nd);
          runs.push(packet === undefined ? run : { ...run, packet });
        }
      }
      continue;
    }
    if (await hasFile(path.join(dir, "manifest.json"))) {
      runs.push(await fromManifest(name, dir));
      continue;
    }
    if (await hasFile(path.join(dir, "report.json"))) runs.push(await fromReport(name, dir));
  }
  return { kind: "ok", runs };
}

/** One image or clip inside a run. A climb out of the env folder, or a type we do not serve, is a 400. */
export async function drawFile(run: string, rel: string): Promise<{ abs: string; mime: string; ranges: boolean }> {
  const root = drawsRoot();
  if (!root) throw new FoundryError(`${ENV} is unset.`, 404);
  if (!RUN_RE.test(run)) throw new FoundryError("That is not a draw id.", 400);
  if (!rel || rel.includes("\0")) throw new FoundryError("That is not a draw file.", 400);
  const dir = containedIn(root, run, false, "draw");
  const abs = containedIn(dir, rel, false, "draw");
  const ext = path.extname(abs).toLowerCase();
  if (!SERVABLE.has(ext)) throw new FoundryError("That file type is not served.", 400);
  try {
    const s = await stat(abs);
    if (!s.isFile()) throw new FoundryError("No such file.", 404);
  } catch (e) {
    if (e instanceof FoundryError) throw e;
    throw new FoundryError("No such file.", 404);
  }
  return { abs, mime: MIME[ext] ?? "application/octet-stream", ranges: VIDEO.has(ext) };
}
