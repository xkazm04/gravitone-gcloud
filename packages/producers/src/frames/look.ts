import { PRESETS } from "@gt/catalog/presets";
import type { StyleBlock } from "@gt/catalog/style";
import type { BlobRef } from "@gt/domain/blob";
import { AppError } from "@gt/domain/errors";
import { LOOK_MISS_WORDS, type LookMiss } from "@gt/domain/partView.frames";
import type { StyleStatus } from "@gt/domain/style.machine";
import { blockDigest, styleRefs, type RatchetStyle } from "@gt/domain/style.ratchet";
import { readStyleIn } from "@gt/kernel/styles/driver";
import type { Reader } from "@gt/kernel/store";

// THE PROJECT'S LOOK - which style a project's pictures are drawn in, answered in ONE place from
// the project's own binding (`project.styleId`) through the Style store (Phase 5 decision 7).
//
// Absorbed from v1 lib/themes.ts `projectStyle` + `STYLE_MISS_WORD`: the frames step once
// resolved "the" style as the account's most recently touched lock, which is wrong for at least
// one project on any account with two; v1 fixed that with a resolver that returns a NAMED MISS
// and never stands another style in. Phase 4 then lost it again on the server: a job cannot read
// the browser's IndexedDB, so lib/producers/frames.ts drew every plate in `PRESETS[0]` and sent
// no references, and nothing said so. Here the binding resolves through the store, the miss is
// named (registry visual-style-locking / draft-proofing-locked-ratchet: "a caller that needs
// pixels supplies its own fallback and says which miss it is covering"), and the fallback is a
// named default the receipt prints - never a silent one.
//
// v1's `deleted` miss is `missing` here: a style is never deleted from the store (its trigger
// refuses), so a binding that does not resolve names a style this store never held (an import
// whose theme did not come along, a store that is not the one the project was made on). One miss
// is new: a catalogue style nobody has adopted has no block to draw (`no-block`).
//
// THE REFERENCES are @gt/domain/style.ratchet `styleRefs`, the one selection the atelier's sheet
// shows: approvals under the current block, the founding PINNED_REFS pinned, the newest rolling,
// SEND_REFS in all - pending and rejected proofs never travel. A LOCKED style's block is frozen
// by the ratchet, so what is sent for a locked style is exactly what was ratified. A style with a
// block that is not locked yet is still drawn in (the project chose it), and the receipt says
// "not locked" - the gate is the atelier's, the honesty is here.

export { LOOK_MISS_WORDS, type LookMiss };

/** What a style row lends a look: the shape the ratchet reads, plus its name and status. */
export type LookStyle = Pick<RatchetStyle, "block" | "proofs"> & { readonly id: string; readonly name: string; readonly status: StyleStatus };

export type ProjectLook = {
  /** The name of what is DRAWN: the project's style, or the default standing in for it. */
  readonly name: string;
  readonly block: StyleBlock;
  /** `blockDigest(block)`: what a plate records it was drawn under. */
  readonly digest: string;
  /** Sent with every image call, in order (empty for the default). */
  readonly refs: readonly BlobRef[];
  /** The project's own style when it resolved (also on a `no-block` miss: it is the one chosen). */
  readonly style?: { readonly id: string; readonly name: string; readonly status: StyleStatus };
  /** Present exactly when the default is drawn. */
  readonly miss?: LookMiss;
};

const first = PRESETS[0];
if (first === undefined) throw new AppError("internal", "@gt/catalog/presets holds no preset; a project with no style has nothing to be drawn in");
/** The NAMED default (v1 useFrames' fallback, the trial grid's strongest): drawn only on a miss. */
export const DEFAULT_LOOK_PRESET: { readonly id: string; readonly name: string; readonly block: StyleBlock } = first;

const fallback = (miss: LookMiss, style?: LookStyle): ProjectLook => ({
  name: DEFAULT_LOOK_PRESET.name,
  block: DEFAULT_LOOK_PRESET.block,
  digest: blockDigest(DEFAULT_LOOK_PRESET.block),
  refs: [],
  miss,
  ...(style === undefined ? {} : { style: { id: style.id, name: style.name, status: style.status } }),
});

/** PURE: the look a binding resolves to, given the style the store holds under it (if any). */
export function lookOf(styleId: string | undefined, style: LookStyle | undefined): ProjectLook {
  if (styleId === undefined) return fallback("unset");
  if (style === undefined) return fallback("missing");
  if (style.block === undefined) return fallback("no-block", style);
  return {
    name: style.name,
    block: style.block,
    digest: blockDigest(style.block),
    refs: styleRefs(style),
    style: { id: style.id, name: style.name, status: style.status },
  };
}

/** The project's look, read in `r` - the receipt, the job's plan step and its units read it alike. */
export function projectLookIn(r: Reader, styleId: string | undefined): ProjectLook {
  if (styleId === undefined) return lookOf(undefined, undefined);
  const row = readStyleIn(r, styleId);
  return lookOf(styleId, row?.style);
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The look as a receipt names it: the style and its reference count, or the default and the miss. */
export function lookWords(l: ProjectLook): string {
  if (l.miss !== undefined) return `default style ${l.name} · ${LOOK_MISS_WORDS[l.miss]}`;
  const status = l.style !== undefined && l.style.status !== "locked" ? ` · ${l.style.status}, not locked` : "";
  return `style ${l.name} · ${plural(l.refs.length, "ref")}${status}`;
}
