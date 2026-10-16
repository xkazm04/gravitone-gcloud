// What a Library item shows in place of itself (library.js `face`, `vface`): the picture when
// there is one, else a face drawn from the item's own data - never a blank tile. The prototype's
// rule for media that cannot show itself ("a designed face, drawn from the item's own data") is
// kept for every kind that has no cover: a take is its waveform, a document is paper, a style
// with no hero plate is a swatch of its own palette, a clip or an export with no poster is its
// designed face (kind, name, the facts that tell it apart).
//
// THE PALETTE is the item's data, not a design value: a style's two leading colours (the Style
// record's palette roles) reach the face as custom properties, the way a share reaches a bar.
// An item that names none draws the two fallback grounds (`--lib-face-a/b`).
//
// Faces are chosen on the server (the port's presentation): which picture leads an item - a
// poster, a keyframe, a style's best plate - is a query over its media facts (plan §6 Phase 5,
// "cover choice ... are queries"), so a near-black render never arrives here as a cover.

import { cx } from "../cx.ts";
import { vars } from "../vars.ts";
import { Wave } from "../wave/Wave.tsx";
import s from "./Face.module.css";

/** Two colours a designed face or a swatch is washed in: the item's own palette. */
export type Palette = readonly [string, string];

export type Face =
  | { readonly kind: "image"; readonly url: string }
  /** A clip or an export drawn by its poster frame; `video` is what the detail plays. */
  | { readonly kind: "poster"; readonly url: string; readonly video?: string }
  | { readonly kind: "wave"; readonly peaks: readonly number[] }
  | { readonly kind: "paper"; readonly title: string; readonly foot: string }
  | { readonly kind: "swatch"; readonly name: string; readonly sub: string; readonly palette?: Palette }
  | { readonly kind: "designed"; readonly lead: string; readonly name: string; readonly tail: string; readonly palette?: Palette; readonly video?: string };

export type FaceSize = "row" | "tile" | "preview";

const wash = (p: Palette | undefined) => (p === undefined ? undefined : vars({ "--a": p[0], "--b": p[1] }));

/** The face, filling its box. `alt` names a picture in the preview; tiles and rows are named by their option. */
export function FaceView({ face, size, alt = "" }: { readonly face: Face; readonly size: FaceSize; readonly alt?: string }) {
  switch (face.kind) {
    case "image":
    case "poster":
      // A plain <img>: a library item is shown as its own bytes, at the size the grid gives it
      // (the Board's `Plate` exemption from next/image, for the same reason).
      // eslint-disable-next-line @next/next/no-img-element -- see above: an item is its own bytes, at the grid's size
      return <img className={s.img} src={face.url} alt={alt} loading={size === "preview" ? "eager" : "lazy"} decoding="async" draggable={false} />;
    case "wave":
      return (
        <span className={cx(s.wave, s[size])}>
          <Wave peaks={face.peaks} width={size === "row" ? 48 : 160} height={size === "row" ? 20 : 48} tone="cyan" />
        </span>
      );
    case "paper":
      return (
        <span className={cx(s.paper, s[size])}>
          <span className={s.paperTitle}>{face.title}</span>
          <small className={s.paperFoot}>{face.foot}</small>
        </span>
      );
    case "swatch":
      return (
        <span className={cx(s.swatch, s[size])} style={wash(face.palette)}>
          <span className={s.swatchName}>{face.name}</span>
          <span className={s.swatchSub}>{face.sub}</span>
        </span>
      );
    case "designed":
      return (
        <span className={cx(s.designed, s[size])} style={wash(face.palette)}>
          <span className={s.lead}>{face.lead}</span>
          <span className={s.name}>{face.name}</span>
          <span className={s.tail}>{face.tail}</span>
        </span>
      );
  }
}
