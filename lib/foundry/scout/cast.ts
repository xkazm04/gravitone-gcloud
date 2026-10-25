// CASTING A KEPT CHARACTER (spark scout-vision S3) - the one door a character's picture passes to reach a Flux frame,
// and the one place her identity is written into a prompt.
//
// THE GUARD, `castStillOf`. Every reference still Flux receives - her kept portrait for her reference sheet, her kept
// sheet for a frame she is cast in - is read here and nowhere else, and only when ALL of this holds:
//   - the character is a kept one (./characters.ts keptCharacters, over the scout nights and the muse archive);
//   - the ref asked for IS her kept portrait's `<runId>/<c-id>` or her kept sheet's - a ref, never a path, and never
//     one a brief supplied: anything else is refused, naming what she has;
//   - that candidate, re-read in its own night in its own root (an archive night's run id is `muse:<night>`), still
//     records that very file as its own image (a portrait: a `character` idea's `image`; a sheet: the `sheet`'s);
//   - the file is relative, never climbs (`..`), never sits under `sources/` and is no file any source of that night
//     holds - our pixels only (registry character-identity-continuity: a found picture never becomes a reference).
//
// THE IDENTITY BLOCK. A cast frame's prompt is compiled in code (./characters.ts castPrompt) - each cast member's
// identityBlock VERBATIM, in cast order, then the frame's own words (the state). The author's words are never trusted
// to restate a face (registry identity-split-from-state: identity verbatim, state separate, diffable).
//
// THE CAST, `castOf`. A brief's `cast: [<name>]` - at most CAST_MAX, each a kept character, none twice - and the
// audience rule: a kids or family character is never cast into work whose audience is not kids or family (the work's
// audience is its idea's seed's; a work with no seed is not a kids or family work).

import { readFile } from "node:fs/promises";

import { err, ok, type Result } from "@gt/domain/errors";

import { REFERENCE_LATE } from "../../imaging/local/flux2.ts";
import { characterKey, keptCharacters, type KeptCharacter, type RootedNight } from "./characters";
import { readRootedNights, resolveInNight } from "./store";
import type { SeedAudience } from "./types";
import { withWing } from "./wingScope";

/** The most characters one brief casts (each kept sheet is one Flux reference: flux2.ts FLUX_REFS_MAX). */
export const CAST_MAX = 3;
/** Where a cast member's kept sheet joins a frame's denoise: the model's frozen value (flux2.ts REFERENCE_LATE). */
export const CAST_LATE = REFERENCE_LATE;
/** The longest compiled prompt Flux takes (flux2.ts PROMPT_MAX). */
export const CAST_PROMPT_MAX = 2_000;

/** The scout nights and the muse archive, each beside its root (night ids COLLIDE across roots). */
export async function rootedNights(): Promise<RootedNight[]> {
  return readRootedNights();
}

/** A kept character by name (folded), or undefined. */
export const keptNamed = (kept: readonly KeptCharacter[], name: string): KeptCharacter | undefined => kept.find((k) => k.key === characterKey(name));

/* ── The guard ────────────────────────────────────────────────────────────── */

export type CastStill = { readonly bytes: Uint8Array; readonly which: "portrait" | "sheet"; readonly ref: string; readonly file: string };

/** `<runId>/<c-id>` -> root and night: `muse:<night>` is the archive, a bare night the scout root. */
function refAt(ref: string): { readonly root: "scout" | "archive"; readonly night: string; readonly cid: string } | null {
  const cut = ref.lastIndexOf("/");
  if (cut <= 0) return null;
  const run = ref.slice(0, cut);
  const cid = ref.slice(cut + 1);
  if (!/^c-\d{2,3}$/.test(cid)) return null;
  return run.startsWith("muse:") ? { root: "archive", night: run.slice("muse:".length), cid } : { root: "scout", night: run, cid };
}

/** Why `file` may not become a reference in `night`, or undefined. */
function fileRefusal(file: string, sources: RootedNight["night"]["sources"]): string | undefined {
  const rel = file.replace(/\\/g, "/");
  if (rel === "" || rel.startsWith("/") || /^[a-z]:/i.test(rel) || rel.split("/").includes("..")) return `${file} is not a file inside its night`;
  if (rel.startsWith("sources/") || sources.some((s) => s.files.some((f) => f.replace(/\\/g, "/") === rel))) return `${file} is a source file (reference-only); a found picture never becomes a character's reference`;
  return undefined;
}

/**
 * THE ONE DOOR a character's picture passes to reach Flux: the bytes of her kept portrait or her kept sheet, asked for
 * by its `<runId>/<c-id>` ref - or why not. `kept` defaults to keptCharacters(nights).
 */
export async function castStillOf(nights: readonly RootedNight[], ask: { readonly name: string; readonly ref: string }, kept: readonly KeptCharacter[] = keptCharacters(nights)): Promise<Result<CastStill>> {
  const k = keptNamed(kept, ask.name);
  if (k === undefined) return err("refused", `${ask.name} is not a kept character; only a kept character's own still is a reference`);
  const which = ask.ref === k.portrait.ref ? "portrait" : k.sheet !== undefined && ask.ref === k.sheet.ref ? "sheet" : undefined;
  if (which === undefined) return err("refused", `${ask.ref} is neither ${k.card.name}'s kept portrait (${k.portrait.ref}) nor her kept sheet (${k.sheet?.ref ?? "none yet"}); a reference is only ever one of those`);
  const at = refAt(ask.ref);
  const want = which === "portrait" ? { root: k.portrait.root, night: k.portrait.night, file: k.portrait.file } : { root: "scout" as const, night: k.sheet?.night ?? "", file: k.sheet?.file ?? "" };
  if (at === null || at.root !== want.root || at.night !== want.night) return err("refused", `${ask.ref} does not name ${k.card.name}'s ${which} night ${want.root === "archive" ? `muse:${want.night}` : want.night}`);
  const rn = nights.find((x) => x.root === at.root && x.night.id === at.night);
  if (rn === undefined) return err("not-found", `night ${ask.ref.slice(0, ask.ref.lastIndexOf("/"))} is not on disk`);
  const c = rn.night.candidates.find((x) => x.id === at.cid);
  const own = which === "portrait" ? (c?.kind === "idea" && c.target === "character" ? c.image : undefined) : c?.kind === "sheet" && c.character === k.key ? c.image : undefined;
  if (own === undefined || own !== want.file) return err("refused", `${ask.ref} does not record ${want.file} as its own ${which}; a reference is the candidate's own image`);
  const why = fileRefusal(want.file, rn.night.sources);
  if (why !== undefined) return err("refused", `${ask.ref}: ${why}`);
  try {
    const abs = withWing(at.root === "archive" ? "muse" : "scout", () => resolveInNight(at.night, want.file));
    return ok({ bytes: new Uint8Array(await readFile(abs)), which, ref: ask.ref, file: want.file });
  } catch (e) {
    return err("not-found", `${ask.ref}: ${want.file} did not read (${e instanceof Error ? e.message : String(e)})`);
  }
}

/* ── The cast ─────────────────────────────────────────────────────────────── */

/** The names a cast's panels may carry mid-sentence (./scene.ts namesIn `allow`): each name, and a parody's origin. */
export function castAllow(names: readonly string[], kept: readonly KeptCharacter[]): string[] {
  return names.flatMap((n) => {
    const card = keptNamed(kept, n)?.card;
    return [n, ...(card === undefined ? [] : [card.name]), ...(card?.kind === "parody" && card.origin !== undefined ? [card.origin] : [])];
  });
}

/** A brief's cast as kept characters, in its order - or why not. `audience` is the work's (its idea's seed's). */
export function castOf(names: readonly string[], kept: readonly KeptCharacter[], audience: SeedAudience | undefined): Result<KeptCharacter[]> {
  if (names.length > CAST_MAX) return err("invalid", `cast: at most ${CAST_MAX} characters, got ${names.length}`);
  const out: KeptCharacter[] = [];
  for (const name of names) {
    const k = keptNamed(kept, name);
    if (k === undefined) return err("refused", `cast: ${name} is not a kept character (kept: ${kept.map((x) => x.card.name).join(", ") || "none"})`);
    if (out.some((x) => x.key === k.key)) return err("invalid", `cast: ${k.card.name} is named twice`);
    const young = k.card.audience === "kids" || k.card.audience === "family";
    if (young && audience !== "kids" && audience !== "family") return err("refused", `cast: ${k.card.name} is a ${k.card.audience} character; never cast into ${audience ?? "unseeded"} work`);
    out.push(k);
  }
  return ok(out);
}

/** How each cast member rides a frame, for the receipt line: `Ilse Marrow (kept sheet, late 0.25) · Ivo (identity block only)`. */
export const castLine = (cast: readonly KeptCharacter[]): string => cast.map((k) => `${k.card.name} (${k.sheet === undefined ? "identity block only" : `kept sheet, late ${CAST_LATE}`})`).join(" · ");

/**
 * The reference stills a cast frame takes: each member's KEPT sheet through the guard; a member with none adds nothing
 * (identity block only). A sheet the guard refuses is the frame's refusal - never drawn without it, never with another.
 */
export async function castRefs(names: readonly string[], nights?: readonly RootedNight[]): Promise<Result<{ readonly refs: readonly Uint8Array[]; readonly from: readonly string[] }>> {
  if (names.length === 0) return ok({ refs: [], from: [] });
  const rooted = nights ?? (await rootedNights());
  const kept = keptCharacters(rooted);
  const refs: Uint8Array[] = [];
  const from: string[] = [];
  for (const name of names) {
    const k = keptNamed(kept, name);
    if (k === undefined) return err("refused", `cast: ${name} is no longer a kept character`);
    if (k.sheet === undefined) continue;
    const got = await castStillOf(rooted, { name, ref: k.sheet.ref }, kept);
    if (!got.ok) return got;
    refs.push(got.value.bytes);
    from.push(got.value.ref);
  }
  return ok({ refs, from });
}
