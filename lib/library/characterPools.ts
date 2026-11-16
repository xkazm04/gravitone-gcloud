// THE CHARACTER POOLS (spark concept-casting-stages S2): what each pool would add to the character record, read from
// its own files and written nowhere. lib/library/characters.ts writes; pipeline/characters-import.mts is the CLI.
//
// THE THREE POOLS, each row with a stable source key:
//   scout-character  keptCharacters over the scout nights and the muse archive, keyed by the folded name.
//   muse-army        foundry-out/muse-army/<run>/ratings.json cards with structured slots, and img/<id>.png.
//   codex-kept       foundry-out/scout-codex/<date>/t6/char-*: only sets verdicts.json says `keep`. A set is drawn from a
//                    muse-army portrait, so one whose name minus `char-` is a muse-army card IS that person (samePerson).
//
// PARODY-CAST IS REFUSED, BY NAME, HERE. Its references are fan-site images, and a found picture never becomes a
// character's reference (lib/foundry/scout/cast.ts). No pool reads it, a CLI asking for it is refused, and any row whose
// pictures or references reach into that folder is skipped.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import type { CharacterAudience, CharacterCard } from "@gt/domain/production";
import type { ImportPool } from "@gt/kernel/characters/store";

import { outPath } from "../fixtures/roots.ts";
import { keptCharacters, type RootedNight } from "../foundry/scout/characters.ts";
import { readRootedNights, resolveInNight } from "../foundry/scout/store.ts";
import { withWing } from "../foundry/scout/wingScope.ts";

export const PARODY_POOL = "parody-cast";
export const PARODY_REFUSAL = "parody-cast is refused: its references are fan-site images, and a found picture never becomes a character's reference";

/** Why a pool may not be imported, or undefined. */
export function refusalOfPool(pool: string): string | undefined {
  return pool === PARODY_POOL ? PARODY_REFUSAL : undefined;
}

/** A pool's files as they sit on disk, for a Row to name. */
export const POOLS: readonly ImportPool[] = ["scout-character", "codex-kept", "muse-army"];

export type RowFile = { readonly role: string; readonly abs: string };

export type PoolRow = {
  readonly pool: ImportPool;
  readonly sourceKey: string;
  readonly samePerson?: string;
  readonly card: CharacterCard;
  readonly files: readonly RowFile[];
  readonly audience?: CharacterAudience;
  readonly slots?: Readonly<Record<string, string>>;
};

export type PoolRead = { readonly rows: readonly PoolRow[]; readonly skipped: readonly { readonly id: string; readonly reason: string }[] };

export type PoolRoots = { readonly museArmy: string; readonly codex: string; readonly nights?: readonly RootedNight[] };

export const poolRoots = (): PoolRoots => ({ museArmy: process.env["MUSE_ARMY_DIR"]?.trim() || outPath("muse-army"), codex: process.env["SCOUT_CODEX_DIR"]?.trim() || outPath("scout-codex") });

const fromParody = (p: string): boolean => p.replace(/\\/g, "/").split("/").includes(PARODY_POOL);

const MUSE_SKIPPED = new Set(["key", "name", "age", "round", "mode"]);

/** The card's slots as strings, empties dropped: absent values omit the key. */
function slotsOf(card: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(card)) {
    if (MUSE_SKIPPED.has(k)) continue;
    const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
    if (s !== "") out[k] = s;
  }
  return out;
}

const SLOTS_OF_LOOK = ["face", "eyes", "brows", "nose", "lips", "skin", "hair", "build", "mark"];

/** Her identity in words, the slots a muse-army card keeps for the face: what never varies. */
function lookOf(slots: Readonly<Record<string, string>>): string {
  return SLOTS_OF_LOOK.flatMap((k) => (slots[k] === undefined ? [] : [slots[k]])).join(", ");
}

/** The line a scene plays her by, from what she was drawn as. */
function personalityOf(slots: Readonly<Record<string, string>>): string {
  const role = slots["role"] ?? "character";
  const use = slots["use"];
  const expression = slots["expression"];
  return `A ${role}${use === undefined ? "" : ` for a ${use}`}${expression === undefined ? "" : `; ${expression}`}.`;
}

type MuseCard = { readonly run: string; readonly id: string; readonly rating: string; readonly card: Record<string, unknown>; readonly name: string; readonly age: number | undefined };

/** Every muse-army card with structured slots, by `<id>` (ids are unique across the runs). */
async function museCards(root: string, skipped: { id: string; reason: string }[]): Promise<ReadonlyMap<string, MuseCard>> {
  const out = new Map<string, MuseCard>();
  if (!existsSync(root)) return out;
  for (const run of (await readdir(root)).sort()) {
    const file = path.join(root, run, "ratings.json");
    if (!existsSync(file)) continue;
    let rows: unknown;
    try {
      rows = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      skipped.push({ id: `muse-army:${run}`, reason: `ratings.json did not parse: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    if (!Array.isArray(rows)) continue;
    for (const row of rows as readonly { id?: unknown; rating?: unknown; card?: unknown }[]) {
      if (typeof row.id !== "string" || typeof row.card !== "object" || row.card === null) continue;
      const card = row.card as Record<string, unknown>;
      if (typeof card["name"] !== "string" || card["name"].trim() === "") continue;
      out.set(row.id, { run, id: row.id, rating: typeof row.rating === "string" ? row.rating : "unrated", card, name: card["name"].trim(), age: typeof card["age"] === "number" ? card["age"] : undefined });
    }
  }
  return out;
}

const museImage = (root: string, c: MuseCard): string => path.join(root, c.run, "img", `${c.id}.png`);

const cardOf = (c: MuseCard, slots: Readonly<Record<string, string>>): CharacterCard => ({ name: c.name, look: lookOf(slots) || `${c.name}, as drawn in her portrait`, personality: personalityOf(slots), ...(c.age === undefined ? {} : { age: c.age }) });

async function readMuse(roots: PoolRoots): Promise<PoolRead> {
  const skipped: { id: string; reason: string }[] = [];
  const cards = await museCards(roots.museArmy, skipped);
  const rows: PoolRow[] = [];
  for (const c of cards.values()) {
    const key = `muse-army:${c.run}/${c.id}`;
    const image = museImage(roots.museArmy, c);
    if (!existsSync(image)) {
      skipped.push({ id: key, reason: `no portrait at ${image}` });
      continue;
    }
    const slots = { ...slotsOf(c.card), rating: c.rating };
    rows.push({ pool: "muse-army", sourceKey: key, card: cardOf(c, slots), files: [{ role: "portrait", abs: image }], slots });
  }
  return { rows, skipped };
}

type CodexVerdicts = { readonly items?: Readonly<Record<string, { readonly verdict?: unknown }>> };
type CodexBrief = { readonly title?: unknown; readonly frames?: readonly { readonly name?: unknown; readonly prompt?: unknown; readonly refs?: readonly unknown[] }[] };

const SET_FILES = [
  ["sheet", "sheet.png"],
  ["hair", "hair.png"],
  ["scene", "scene.png"],
  ["concept", "concept.png"],
] as const;

async function readCodex(roots: PoolRoots): Promise<PoolRead> {
  const skipped: { id: string; reason: string }[] = [];
  const rows: PoolRow[] = [];
  if (!existsSync(roots.codex)) return { rows, skipped };
  const cards = await museCards(roots.museArmy, skipped);
  for (const date of (await readdir(roots.codex)).sort()) {
    const verdictsFile = path.join(roots.codex, date, "verdicts.json");
    const t6 = path.join(roots.codex, date, "t6");
    if (!existsSync(verdictsFile) || !existsSync(t6)) continue;
    const items = (JSON.parse(await readFile(verdictsFile, "utf8")) as CodexVerdicts).items ?? {};
    for (const set of (await readdir(t6)).filter((d) => d.startsWith("char-")).sort()) {
      if (items[set]?.verdict !== "keep") continue;
      const key = `codex-kept:${date}/${set}`;
      const dir = path.join(t6, set);
      const briefFile = path.join(dir, "brief.json");
      if (!existsSync(briefFile)) {
        skipped.push({ id: key, reason: "no brief.json" });
        continue;
      }
      const brief = JSON.parse(await readFile(briefFile, "utf8")) as CodexBrief;
      const refs = (brief.frames ?? []).flatMap((f) => (f.refs ?? []).filter((r): r is string => typeof r === "string"));
      if (refs.some(fromParody)) {
        skipped.push({ id: key, reason: PARODY_REFUSAL });
        continue;
      }
      const stem = set.slice("char-".length);
      const muse = cards.get(stem);
      const files: RowFile[] = muse === undefined ? [] : [{ role: "portrait", abs: museImage(roots.museArmy, muse) }];
      for (const [role, name] of SET_FILES) if (existsSync(path.join(dir, name))) files.push({ role, abs: path.join(dir, name) });
      if (files.length === 0) {
        skipped.push({ id: key, reason: "no picture in the set" });
        continue;
      }
      const slots = { ...(muse === undefined ? {} : slotsOf(muse.card)), ...(muse === undefined ? {} : { rating: muse.rating }), codexSet: set };
      const title = typeof brief.title === "string" && brief.title.trim() !== "" ? brief.title.trim() : stem;
      const age = /aged (\d{1,3})/.exec((brief.frames ?? []).map((f) => (typeof f.prompt === "string" ? f.prompt : "")).join(" "));
      rows.push({
        pool: "codex-kept",
        sourceKey: key,
        ...(muse === undefined ? {} : { samePerson: `muse-army:${muse.run}/${muse.id}` }),
        card:
          muse !== undefined
            ? cardOf(muse, slotsOf(muse.card))
            : { name: title, look: `Kept Codex set ${set}: no written card, the pictures are the identity`, personality: `Kept Codex set ${set}`, ...(age === null ? {} : { age: Number(age[1]) }) },
        files,
        slots,
      });
    }
  }
  return { rows, skipped };
}

async function readScout(roots: PoolRoots): Promise<PoolRead> {
  const skipped: { id: string; reason: string }[] = [];
  const rows: PoolRow[] = [];
  const nights = roots.nights ?? (await readRootedNights());
  for (const k of keptCharacters(nights)) {
    const key = `scout-character:${k.key}`;
    const inNight = (root: "scout" | "archive", night: string, file: string): string | undefined => {
      if (file.replace(/\\/g, "/").startsWith("sources/")) {
        skipped.push({ id: key, reason: `${file} is a source file, not our picture` });
        return undefined;
      }
      try {
        return withWing(root === "archive" ? "muse" : "scout", () => resolveInNight(night, file));
      } catch (e) {
        skipped.push({ id: key, reason: `${file}: ${e instanceof Error ? e.message : String(e)}` });
        return undefined;
      }
    };
    const portrait = inNight(k.portrait.root, k.portrait.night, k.portrait.file);
    if (portrait === undefined) continue;
    const sheet = k.sheet === undefined ? undefined : inNight("scout", k.sheet.night, k.sheet.file);
    const slots: Record<string, string> = {
      ...(k.card.kind === undefined ? {} : { kind: k.card.kind }),
      ...(k.card.render === undefined ? {} : { render: k.card.render }),
      ...(k.card.origin === undefined ? {} : { parodyOf: k.card.origin }),
    };
    rows.push({
      pool: "scout-character",
      sourceKey: key,
      card: { name: k.card.name, look: k.card.look, personality: k.card.personality, age: k.card.age },
      files: [{ role: "portrait", abs: portrait }, ...(sheet === undefined ? [] : [{ role: "sheet", abs: sheet }])],
      ...(k.card.audience === undefined ? {} : { audience: k.card.audience }),
      ...(Object.keys(slots).length === 0 ? {} : { slots }),
    });
  }
  return { rows, skipped };
}

/** What a pool holds now, or why not (parody-cast, by name). */
export async function readPool(pool: string, roots: PoolRoots = poolRoots()): Promise<Result<PoolRead>> {
  const why = refusalOfPool(pool);
  if (why !== undefined) return err("refused", why);
  switch (pool) {
    case "muse-army":
      return ok(await readMuse(roots));
    case "codex-kept":
      return ok(await readCodex(roots));
    case "scout-character":
      return ok(await readScout(roots));
    default:
      return err("invalid", `no character pool named ${pool}`);
  }
}

/** A row's digest over its words and its files' sizes and times, so an unchanged source is never re-read. */
export async function digestOfRow(row: PoolRow): Promise<string> {
  const stats = await Promise.all(
    row.files.map(async (f) => {
      const st = await stat(f.abs);
      return { role: f.role, name: path.basename(f.abs), size: st.size, mtimeMs: Math.round(st.mtimeMs) };
    }),
  );
  const body = JSON.stringify({ pool: row.pool, samePerson: row.samePerson ?? null, card: row.card, audience: row.audience ?? null, slots: row.slots ?? null, files: stats });
  return createHash("sha256").update(body).digest("hex");
}
