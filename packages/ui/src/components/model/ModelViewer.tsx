"use client";

// A GAME ASSET IN 3D (spark game-3d-assets WP3): its glb on a turntable the operator orbits, with
// the wireframe and, for a rigged model, its bones laid over it, and the triangle count the file
// itself carries. Mounted only where one model is looked at closely - the Library's detail and the
// Board's zoom - never in a tile, a row or a run card, which draw the model's poster.
//
// THE LAZY BOUNDARY. three and @react-three/fiber are ~200 kB gzip; this file imports neither. The
// stage (./ModelStage.tsx) is `lazy()`-imported and rendered only on the client and only when the
// browser has WebGL, so a page that never opens a model never fetches the chunk, and a server
// render draws the poster under "loading" instead of reaching for a canvas.
//
// THE HONEST STATES: loading (the poster, if any, under a loading chip); failed (the loader's own
// sentence, verbatim, in an ErrorLine - a broken glb is a fact about the file); no WebGL (said, and
// the poster stays). The counts are the loaded scene's when it loads, else the ones the caller
// measured (media-facts), so a model that cannot be drawn still says how heavy it is.

import { lazy, Suspense, useState, useSyncExternalStore } from "react";

import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Toggle } from "../toggle/Toggle.tsx";
import type { ModelLoad } from "./model.ts";
import s from "./ModelViewer.module.css";

const ModelStage = lazy(() => import("./ModelStage.tsx"));

export type { ModelLoad, StageInk } from "./model.ts";

export type ModelViewerProps = {
  /** The glb's address (the blob route, the file route, or a fixture's data: URL). */
  readonly src: string;
  /** The accessible name: what the model is. */
  readonly title: string;
  readonly poster?: string;
  /** The counts media-facts measured, drawn until (and unless) the scene loads. */
  readonly tris?: number;
  readonly bones?: number;
  /** The Board's zoom fills the lens; the Library's detail is a 16:10 pane. */
  readonly fill?: boolean;
};

/** What hasWebGL needs of a document: a canvas to ask for a context. */
export type CanvasMaker = { readonly createElement: (tag: "canvas") => { getContext: (id: string) => unknown } };

/** Can this browser draw WebGL at all? Asked once, on mount. */
export function hasWebGL(doc: CanvasMaker = document): boolean {
  try {
    const c = doc.createElement("canvas");
    return (c.getContext("webgl2") ?? c.getContext("webgl")) !== null;
  } catch {
    return false;
  }
}

// Asked once per page: a browser does not gain or lose WebGL while it is open. The server's
// answer is "not known yet", so the server render and the first client render agree (loading).
let webgl: boolean | undefined;
const webglNow = (): boolean => (webgl ??= hasWebGL());
const unchanging = (): (() => void) => () => undefined;

const fmt = (n: number): string => n.toLocaleString("en-US");

export function ModelViewer({ src, title, poster, tris, bones, fill = false }: ModelViewerProps) {
  const gl = useSyncExternalStore(unchanging, webglNow, () => null);
  const [loaded, setLoad] = useState<ModelLoad>({ kind: "loading" });
  const [wire, setWire] = useState(false);
  const [showBones, setShowBones] = useState(false);
  const load: ModelLoad = gl === false ? { kind: "no-webgl" } : loaded;
  const shownTris = load.kind === "ready" ? load.tris : tris;
  const shownBones = load.kind === "ready" ? load.bones : bones;
  const stage = gl === true && load.kind !== "failed";
  return (
    <figure className={cx(s.viewer, fill && s.fill)} aria-label={`${title}, 3D model`} data-model-state={load.kind}>
      <div className={s.stage}>
        {load.kind !== "ready" && poster !== undefined && (
          // eslint-disable-next-line @next/next/no-img-element -- the poster is the model's own render, at the pane's size
          <img className={s.poster} src={poster} alt="" draggable={false} />
        )}
        {stage && (
          <Suspense fallback={null}>
            <ModelStage key={src} src={src} wireframe={wire} bones={showBones} onLoad={setLoad} label={title} />
          </Suspense>
        )}
        {load.kind === "loading" && (
          <span className={s.badge}>
            <Chip label="loading" ghost casing="lower" />
          </span>
        )}
        {(load.kind === "failed" || load.kind === "no-webgl") && (
          <span className={s.err}>
            <ErrorLine message={load.kind === "failed" ? load.message : "WebGL is not available in this browser; the model cannot be drawn."} />
          </span>
        )}
      </div>
      <figcaption className={s.bar}>
        {shownTris !== undefined && <Chip label="tris" value={fmt(shownTris)} casing="lower" />}
        {shownBones !== undefined && shownBones > 0 && <Chip label="bones" value={shownBones} casing="lower" />}
        {stage && (
          <span className={s.toggles}>
            <Toggle label="wireframe" on={wire} onToggle={setWire} />
            {shownBones !== undefined && shownBones > 0 && <Toggle label="bones" on={showBones} onToggle={setShowBones} />}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
