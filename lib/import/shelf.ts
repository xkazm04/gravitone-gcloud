import { readFileSync } from "node:fs";
import path from "node:path";

import { presetById } from "@gt/catalog/presets";
import type { BlobRef } from "@gt/domain/blob";
import { parseAt } from "@gt/domain/door";
import { libraryItemSchema, type LibraryItemInput } from "@gt/domain/libraryItem";
import type { LibraryEntry } from "@gt/kernel/library/core";
import type { Reader } from "@gt/kernel/store";
import { withStatus } from "@gt/kernel/styles/core";
import { admit, readStyleIn } from "@gt/kernel/styles/driver";
import { draftFromV1Theme, themeStyleId, type ThemeDraft } from "@gt/kernel/styles/v1theme";

import { uploadOf, type Archive, type Row } from "./archive.ts";
import { dataUrl, stage, type Sink, type StagedBlob } from "./bytes.ts";
import type { Outcome } from "./project.ts";

// THE ACCOUNT'S SHELF, STAGED (Phase 5 wave B, L55) - every v1 theme as a Style and every shelf
// asset as a Library item, read out of the same `.gravitone` archive the projects come in, and
// shown on the same preview before anything is written (registry import-normalization: detect ->
// parse -> adapt -> review -> commit). ./commit.ts writes what this stages.
//
// WHY THE WHOLE SHELF NOW. Phase 4 imported a project's theme only as a ref (`v1-theme:<id>`) and
// left every other theme and the asset shelf in the browser, reported as dropped. Those browser
// stores are retired in this phase (lib/themes.ts, lib/assets.ts and the v1 Library are gone), so
// the archive is their last reader: a theme or an asset this import does not take is lost.
//
//   theme   -> @gt/kernel/styles/v1theme `draftFromV1Theme`, id `v1-theme:<id>` (the id imported
//              projects already carry), proofs' base64 as blobs. A theme v1 locked imports locked
//              and grandfathered; one it did not meets the new gate. v1 dropped an unnamed theme
//              (`purgeUntitledStyles`, and the theme door wants a name): here it is NAMED, from its
//              preset, then the Foundry style it was adopted from, then its origin and day - a
//              theme with a proof sheet is work, whatever it was called.
//   asset   -> a Library item `v1-asset:<id>` (origin `import`), its bytes a blob: an upload's
//              `{type, b64}`, a promoted proof's bytes out of its theme (the same blob the
//              style's proof holds), a `data:` URL, or a file the studio serves from public/. The
//              folder chain becomes a `pin` collection (`styles/proofs/ledger-ink`) - the shelf's
//              folders were the operator's own collections - and every imported project whose
//              records name the asset a `project` collection, so the v1 asset ids inside imported
//              records resolve to an item (Phase 4 carry-forward).
// Re-import is idempotent by id: a style or an item the store already holds is skipped, and the
// store's copy stays the truth.

export const ASSET_FEED = "v1-import";
export const v1AssetItemId = (assetId: string): string => `v1-asset:${assetId}`;

export type ThemePreview = {
  readonly v1Id: string;
  readonly id: string;
  readonly name: string;
  /** v1 had no name for it; `name` was given here. */
  readonly named: boolean;
  readonly outcome: Outcome;
  readonly reason?: string;
  readonly locked: boolean;
  readonly proofs: number;
  /** Proofs whose bytes the archive does not carry (left out of the style, counted). */
  readonly missing: number;
};

export type ItemPreview = {
  readonly v1Id: string;
  readonly id: string;
  readonly title: string;
  readonly kind: "image" | "audio";
  readonly outcome: Outcome;
  readonly reason?: string;
};

export type StagedTheme = { readonly preview: ThemePreview; readonly draft?: ThemeDraft; readonly blobs: readonly StagedBlob[] };
export type StagedItem = { readonly preview: ItemPreview; readonly entry?: LibraryEntry; readonly blobs: readonly StagedBlob[] };

/** The bytes of a file the studio serves (a seeded trial plate's `/trials/...`), or null. */
export type PublicFile = (src: string) => { readonly bytes: Uint8Array; readonly mime: string } | null;

const PUBLIC_MIME: Readonly<Record<string, string>> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

/** public/ under the working directory, never above it. */
export const publicFile: PublicFile = (src) => {
  if (!src.startsWith("/") || src.startsWith("//")) return null;
  const root = path.resolve(process.cwd(), "public");
  const abs = path.resolve(root, `.${decodeURI(src.split(/[?#]/)[0] ?? "")}`);
  const mime = PUBLIC_MIME[path.extname(abs).toLowerCase()];
  if (mime === undefined || !abs.startsWith(root + path.sep)) return null;
  try {
    return { bytes: new Uint8Array(readFileSync(abs)), mime };
  } catch {
    return null;
  }
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap((x) => (str(x) === undefined ? [] : [String(x).trim()])) : []);
const iso = (ms: unknown): string | undefined => (typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : undefined);
const b64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64"));

/** v1's `UNTITLED`: the name its retired "From a brief" button stamped on every style. */
const UNTITLED = "Untitled style";
/** v1 lib/themes.ts ORIGIN_WORD, for a name nobody gave. */
const ORIGIN_NAME: Readonly<Record<string, string>> = { scratch: "Brief style", preset: "Preset style", screenshot: "Screenshot style", plate: "Plate style", foundry: "Foundry style" };

/** A theme's name, or one made from what it was started from (see the header). */
export function themeName(row: Row): { readonly name: string; readonly named: boolean } {
  const given = str(row["name"]);
  if (given !== undefined && given !== UNTITLED) return { name: given, named: false };
  const preset = presetById.get(str(row["presetId"]) ?? "")?.name;
  if (preset !== undefined) return { name: preset, named: true };
  const foundry = str(row["foundryStyleId"]);
  if (foundry !== undefined) return { name: foundry.replace(/[-_]+/g, " "), named: true };
  const day = iso(row["createdAt"])?.slice(0, 10);
  return { name: `${ORIGIN_NAME[String(row["origin"])] ?? "Style"}${day === undefined ? "" : ` ${day}`}`, named: true };
}

function stageTheme(r: Reader, row: Row): StagedTheme {
  const v1Id = String(row["id"]);
  const id = themeStyleId(v1Id);
  const { name, named } = themeName(row);
  const sink: Sink = new Map();
  const media = new Map<string, BlobRef>();
  const proofs = Array.isArray(row["proofs"]) ? row["proofs"] : [];
  for (const p of proofs) {
    if (!isObj(p) || typeof p["id"] !== "string" || typeof p["base64"] !== "string" || p["base64"] === "") continue;
    media.set(p["id"], stage(sink, b64(p["base64"]), typeof p["mime"] === "string" ? p["mime"] : "image/png"));
  }
  const base = { v1Id, id, name, named, locked: typeof row["lockedAt"] === "number", proofs: proofs.length };
  const drafted = draftFromV1Theme({ ...row, name }, (proofId) => media.get(proofId));
  if (!drafted.ok) return { preview: { ...base, missing: 0, outcome: "refuse", reason: drafted.error.message }, blobs: [] };
  const missing = drafted.value.missing.length;
  if (readStyleIn(r, id) !== undefined) return { preview: { ...base, missing, outcome: "skip", reason: `already in the store as ${id}` }, blobs: [] };
  // The store's own door, read now, so a theme it would refuse is refused on the preview.
  const admitted = admit(withStatus(drafted.value.draft));
  if (!admitted.ok) return { preview: { ...base, missing, outcome: "refuse", reason: admitted.error.message }, blobs: [] };
  return { preview: { ...base, missing, outcome: "import" }, draft: drafted.value, blobs: [...sink.values()] };
}

/** v1 AudioMeta's verdict in the Library's state words. */
const AUDIO_STATE: Readonly<Record<string, "ratified" | "rejected" | "unjudged">> = { kept: "ratified", proven: "ratified", rejected: "rejected" };

type Bytes = { readonly ref: BlobRef; readonly origin: "upload" | "proof" | "inline" | "public" };

function bytesOf(a: Row, archive: Archive, sink: Sink, pub: PublicFile): Bytes | string {
  const src = typeof a["src"] === "string" ? a["src"] : "";
  const up = uploadOf(src);
  if (up !== null) {
    const u = archive.rows.uploads.find((x) => x["id"] === up);
    const blob = u === undefined ? undefined : u["blob"];
    if (!isObj(blob) || typeof blob["b64"] !== "string") return `its upload ${up} is not in the archive`;
    return { ref: stage(sink, b64(blob["b64"]), typeof blob["type"] === "string" ? blob["type"] : "application/octet-stream"), origin: "upload" };
  }
  if (src.startsWith("proof:")) {
    const [themeId, proofId] = src.slice(6).split("/");
    const theme = archive.rows.themes.find((t) => t["id"] === themeId);
    const proof = theme !== undefined && Array.isArray(theme["proofs"]) ? theme["proofs"].find((p) => isObj(p) && p["id"] === proofId) : undefined;
    if (!isObj(proof) || typeof proof["base64"] !== "string" || proof["base64"] === "") return `its proof ${proofId ?? "?"} is not in theme ${themeId ?? "?"} in the archive`;
    return { ref: stage(sink, b64(proof["base64"]), typeof proof["mime"] === "string" ? proof["mime"] : "image/png"), origin: "proof" };
  }
  const d = dataUrl(src);
  if (d !== null) return { ref: stage(sink, d.bytes, d.mime || "application/octet-stream"), origin: "inline" };
  const f = src === "" ? null : pub(src);
  if (f !== null) return { ref: stage(sink, f.bytes, f.mime), origin: "public" };
  return src === "" ? "it carries no bytes" : `its file ${src.slice(0, 80)} is not served here`;
}

function stageAsset(r: Reader, a: Row, archive: Archive, projects: ReadonlyMap<string, readonly string[]>, pub: PublicFile): StagedItem {
  const v1Id = String(a["id"]);
  const id = v1AssetItemId(v1Id);
  const kind = a["kind"] === "audio" ? "audio" : "image";
  const title = str(a["name"]) ?? v1Id;
  const base = { v1Id, id, title, kind } as const;
  if (r.get("SELECT 1 AS x FROM library_docs WHERE id = ?", id) !== undefined) return { preview: { ...base, outcome: "skip", reason: `already in the Library as ${id}` }, blobs: [] };
  const sink: Sink = new Map();
  const bytes = bytesOf(a, archive, sink, pub);
  const meta = isObj(a["meta"]) ? a["meta"] : {};
  if (typeof bytes === "string" && kind === "image") return { preview: { ...base, outcome: "refuse", reason: bytes }, blobs: [] };
  const folder = strs(a["path"]);
  const collections = [...(folder.length > 0 ? [{ kind: "pin" as const, id: folder.join("/") }] : []), ...(projects.get(v1Id) ?? []).map((p) => ({ kind: "project" as const, id: p }))];
  const at = iso(a["createdAt"]);
  const proofTheme = typeof bytes !== "string" && bytes.origin === "proof" ? String(a["src"]).slice(6).split("/")[0] : undefined;
  const styleId = proofTheme === undefined ? undefined : themeStyleId(proofTheme);
  const shared = {
    id,
    title,
    collections,
    origin: "import" as const,
    source: "real" as const,
    ...(typeof bytes === "string" ? {} : { media: bytes.ref }),
    ...(at === undefined ? {} : { at }),
  };
  let item: LibraryItemInput;
  if (kind === "image") {
    item = {
      ...shared,
      kind: "image",
      // A promoted proof was an approval on a style's sheet; anything else on the shelf a reference.
      state: styleId === undefined ? "reference" : "ratified",
      rights: { use: styleId === undefined ? "unknown" : "publishable" },
      lineage: styleId === undefined ? [] : [{ kind: "style", id: styleId }],
      vocabulary: { styles: styleId === undefined ? [] : [styleId], ...(folder[0] === undefined ? {} : { set: folder[0] }) },
    };
  } else {
    const durationS = typeof meta["duration_s"] === "number" && meta["duration_s"] > 0 ? meta["duration_s"] : undefined;
    // A take with no bytes went to the sound store with v1's own migration (soundMigration.ts)
    // and the Library reads it there; one with no measured length has no honest duration.
    if (typeof bytes === "string") return { preview: { ...base, outcome: "refuse", reason: `${bytes}; the sound store holds v1's takes` }, blobs: [] };
    if (durationS === undefined) return { preview: { ...base, outcome: "refuse", reason: "an audio take with no measured length" }, blobs: [] };
    const vendor = meta["vendor"] === "suno" || meta["vendor"] === "elevenlabs" ? meta["vendor"] : "local";
    const sfx = str(meta["sfx_category"]);
    item = {
      ...shared,
      kind: "audio",
      state: AUDIO_STATE[String(meta["verdict"])] ?? "unjudged",
      rights: { use: "unknown" },
      lineage: [],
      vocabulary: {
        type: sfx === undefined ? "music" : "sfx",
        genre: strs(meta["genre_tags"]),
        mood: strs(meta["mood_tags"]),
        instrument: strs(meta["instrumentation"]),
        provider: vendor,
        durationS,
        ...(typeof meta["tempo_bpm"] === "number" && meta["tempo_bpm"] > 0 ? { tempoBpm: meta["tempo_bpm"] } : {}),
        ...(str(meta["key"]) === undefined ? {} : { key: String(meta["key"]).trim() }),
        ...(sfx === undefined ? {} : { group: sfx }),
      },
    };
  }
  const door = parseAt(`v1 asset ${v1Id}`, libraryItemSchema, item);
  if (!door.ok) return { preview: { ...base, outcome: "refuse", reason: door.error.message }, blobs: [] };
  const entry: LibraryEntry = { item, meta: folder.join(" / "), extras: folder.length > 0 ? { file: { path: folder.join("/") } } : {}, feed: ASSET_FEED };
  return { preview: { ...base, outcome: "import" }, entry, blobs: [...sink.values()] };
}

/** Every theme of the archive, staged against the store as it is now. */
export const stageThemes = (r: Reader, archive: Archive): StagedTheme[] => archive.rows.themes.map((t) => stageTheme(r, t));

/**
 * Every shelf asset of the archive, staged against the store as it is now. `projects` maps a v1
 * asset id to the kernel ids of the imported projects whose records name it.
 */
export const stageItems = (r: Reader, archive: Archive, projects: ReadonlyMap<string, readonly string[]>, pub: PublicFile = publicFile): StagedItem[] =>
  archive.rows.assets.map((a) => stageAsset(r, a, archive, projects, pub));
