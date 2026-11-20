"use client";

// THE GALLERY - the triage surface, fullscreen over the canvas, nested and keyboard first (port of the winner's
// gallery.js, contest scout-canvas-v2-r2 A/1). Open when `ui.surface` is a gallery: it holds everything waiting on a
// verdict under that point, across nights and packets: point › basin › river › wall › one candidate › one frame.
// Keep / reject / reasons / note / undo / commit are ../acts.ts; Esc goes up one view (frame → one → wall → close).
// Its keys are the keymap's `canvas-gallery` rows, registered while it is open; it never listens to a key itself.

import { useEffect, useRef, useState } from "react";

import { useKeys, type KeyHandlers } from "@gt/ui/keymap/dispatch";

import { commit as commitAct, uncommitted, undo as undoAct, verdict } from "../acts.ts";
import { epFor, scopeName } from "../scene/scopes.ts";
import type { Surface } from "../store.ts";
import { REASONS, STATE, VERDICT, type Verdict } from "../tables.ts";
import { useCanvas } from "../useCanvas.ts";
import { Done, Empty } from "./gallery/Done.tsx";
import { Foot } from "./gallery/Foot.tsx";
import { advance, cur, left, openG, relist, step, waiting, type G, type Kind, type Narrow } from "./gallery/model.tsx";
import { Rail } from "./gallery/Rail.tsx";
import { Stage, type Stamp } from "./gallery/Stage.tsx";
import { Top, type CrumbKey } from "./gallery/Top.tsx";
import { Wall } from "./gallery/Wall.tsx";
import { Words } from "./gallery/Words.tsx";
import s from "./gallery.module.css";
import { capOf } from "./kit.tsx";

type GallerySurface = Extract<NonNullable<Surface>, { kind: "gallery" }>;

const M = "canvas-gallery";
/** How long the verdict's stamp plays before the next candidate comes up (the winner's 260 ms). */
const STAMP_MS = 260;

/** One number per opening, so a re-opened gallery starts fresh. */
const openings = new WeakMap<GallerySurface, number>();
let seq = 0;
const openingOf = (sf: GallerySurface): number => {
  let n = openings.get(sf);
  if (n === undefined) {
    n = ++seq;
    openings.set(sf, n);
  }
  return n;
};

const still = (): boolean => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Gallery() {
  const st = useCanvas();
  const sf = st.ui.surface;
  if (sf === null || sf.kind !== "gallery") return null;
  return <OpenGallery key={openingOf(sf)} sf={sf} />;
}

function OpenGallery({ sf }: { readonly sf: GallerySurface }) {
  const st = useCanvas();
  const [g, setG] = useState<G | null>(() => openG(st.scene, sf.scope, sf.block, sf.focus));
  const [fall, setFall] = useState(0);
  const [stamp, setStamp] = useState<Stamp>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const noteRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const resetScroll = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const upd = (f: (x: G) => G): void => setG((x) => (x === null ? x : f(x)));
  const close = (): void => st.closeSurface();

  // Nothing waits here: say so and close (the winner's toast).
  useEffect(() => {
    if (g !== null) return;
    st.say(`0 awaiting a verdict · ${scopeName(sf.scope)}`);
    st.closeSurface();
  }, [g, st, sf.scope]);

  useEffect(() => {
    alive.current = true;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      alive.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  // The wall keeps its scroll unless the list changed under it; the cursor's tile stays in view.
  useEffect(() => {
    if (g === null || g.mode !== "wall" || g.finished) return;
    const m = mainRef.current;
    if (m !== null && resetScroll.current) m.scrollTop = 0;
    resetScroll.current = false;
    tiles.current[g.idx]?.scrollIntoView({ block: "nearest" });
  }, [g]);

  // The next candidate's first picture, fetched while this one is judged.
  useEffect(() => {
    if (g === null) return;
    const nx = g.list.find((x, i) => i > g.idx && waiting(x)) ?? g.list[g.idx + 1];
    const f = nx?.media?.files.find((x) => x.type === "image");
    if (f === undefined) return;
    const im = new Image();
    im.src = f.src;
  }, [g]);

  /* ---------- verbs (gallery.js) ---------- */

  const stepBy = (d: number): void => upd((x) => step(x, d));

  const row = (d: number): void => {
    if (g === null) return;
    if (g.mode !== "wall") return stepBy(d);
    const c = tiles.current[g.idx];
    if (c === null || c === undefined) return;
    const r = c.getBoundingClientRect();
    let best: number | null = null;
    let bd = 1e9;
    for (let i = 0; i < g.list.length; i++) {
      const t = tiles.current[i];
      if (t === null || t === undefined) continue;
      const q = t.getBoundingClientRect();
      const dy = (q.top - r.top) * d;
      if (dy < 8) continue;
      const sc = dy * 4 + Math.abs(q.left - r.left);
      if (sc < bd) {
        bd = sc;
        best = i;
      }
    }
    if (best !== null) {
      const to = best;
      upd((x) => ({ ...x, idx: to }));
    }
  };

  const decide = (v: Verdict): void => {
    if (g === null) return;
    const it = cur(g);
    if (it === undefined || g.finished) return;
    if (!waiting(it)) {
      st.say(`${STATE[it.state].word} · ${capOf(M, "undo")} undoes`);
      return;
    }
    verdict(st, it, v, { reasons: g.reasons, note: g.note });
    upd((x) => ({ ...x, reasons: [], note: "" }));
    const next = (): void => {
      timer.current = null;
      if (!alive.current) return;
      setStamp(null);
      upd(advance);
      setFall((n) => n + 1);
    };
    if (g.mode === "wall" || still()) return next();
    const V = VERDICT[v];
    setStamp((p) => ({ text: V.to, tone: V.tone, n: (p?.n ?? 0) + 1 }));
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(next, STAMP_MS);
  };

  const reason = (i: number): void => {
    const r = REASONS[i];
    if (r === undefined) return;
    upd((x) => ({ ...x, reasons: x.reasons.includes(r) ? x.reasons.filter((y) => y !== r) : [...x.reasons, r] }));
  };

  const undo = (): void => {
    const e = undoAct(st);
    if (e === null) return;
    upd((x) => {
      const i = x.list.indexOf(e.it);
      return { ...x, finished: false, idx: i >= 0 ? i : x.idx };
    });
  };

  const commit = async (): Promise<void> => {
    if (g === null || uncommitted(st).length === 0) return;
    const all = g.all;
    await commitAct(st);
    if (alive.current && left(all) === 0) close();
  };

  const up1 = (): void => {
    if (g === null) return close();
    if (g.mode === "frame") return upd((x) => ({ ...x, mode: "one" }));
    if (g.finished) return close();
    if (g.mode === "one" && g.list.length > 1) {
      resetScroll.current = true;
      return upd((x) => ({ ...x, mode: "wall" }));
    }
    close();
  };

  const openVerb = (): void =>
    upd((x) => {
      if (x.finished) return x;
      if (x.mode === "wall") return { ...x, mode: "one" };
      if (x.mode === "one") {
        const c = cur(x);
        return c !== undefined && c.media !== null ? { ...x, mode: "frame", frame: 0 } : x;
      }
      return { ...x, mode: "one" };
    });

  const handlers: KeyHandlers = {
    keep: () => decide("keep"),
    reject: () => decide("reject"),
    reason: (hit) => reason(hit.index),
    next: () => stepBy(1),
    prev: () => stepBy(-1),
    "row-down": () => row(1),
    "row-up": () => row(-1),
    open: openVerb,
    note: () => noteRef.current?.focus(),
    undo,
    commit: () => void commit(),
    play: () => {
      const v = videoRef.current;
      if (v === null) return false;
      if (v.paused) void v.play();
      else v.pause();
    },
    up: up1,
    "leave-field": () => {
      noteRef.current?.blur();
      rootRef.current?.focus({ preventScroll: true });
    },
  };
  useKeys(M, handlers, { enabled: g !== null });

  if (g === null) return null;

  /* ---------- clicks ---------- */

  const onCrumb = (k: CrumbKey): void =>
    upd((x) => {
      const f = { ...x, finished: false };
      const c = cur(f);
      if (k === "root") return { ...relist({ ...f, narrow: null }, c), mode: "wall" };
      if (k === "river" && c !== undefined) return { ...relist({ ...f, narrow: { type: "river", ref: c.river } }, c), mode: "wall" };
      if (k === "wall") return { ...f, mode: "wall" };
      if (k === "one") return { ...f, mode: "one" };
      return f;
    });
  const onKind = (k: Kind): void => {
    resetScroll.current = true;
    upd((x) => ({ ...relist({ ...x, kind: k, narrow: null, finished: false }), mode: k === "seeds" ? "wall" : "one" }));
  };
  const onNarrow = (n: Narrow): void => {
    resetScroll.current = true;
    upd((x) => ({ ...relist({ ...x, narrow: n, finished: false }), mode: "wall" }));
  };

  const setTile = (i: number, el: HTMLButtonElement | null): void => {
    tiles.current[i] = el;
  };
  const it = cur(g);
  const un = uncommitted(st).length;
  const beats = it === undefined ? null : (epFor(st.scene, it)?.beats ?? null);

  return (
    <div ref={rootRef} className={s.shell} data-role="gallery" data-mode={g.finished ? "done" : g.mode} role="dialog" aria-modal="true" aria-label={`Gallery · ${scopeName(g.scope)}`} tabIndex={-1}>
      <Top g={g} fall={fall} onCrumb={onCrumb} onKind={onKind} onClose={close} />
      <Rail g={g} scene={st.scene} onNarrow={onNarrow} />
      <div ref={mainRef} className={s.main}>
        {g.finished ? (
          <Done g={g} un={un} onCommit={() => void commit()} onKind={onKind} onClose={close} />
        ) : g.list.length === 0 ? (
          <Empty g={g} />
        ) : g.mode === "wall" ? (
          <Wall g={g} scene={st.scene} onTile={setTile} onOpen={(i) => upd((x) => ({ ...x, idx: i, mode: "one" }))} />
        ) : it === undefined ? null : (
          <div className={s.one}>
            <Stage g={g} it={it} beats={beats} stamp={stamp} vref={videoRef} onFrame={(i) => upd((x) => ({ ...x, frame: i, mode: "frame" }))} onOne={() => upd((x) => ({ ...x, mode: "one" }))} />
            {g.mode === "frame" ? <div /> : <Words g={g} it={it} scene={st.scene} />}
          </div>
        )}
      </div>
      <Foot
        g={g}
        un={un}
        noteRef={noteRef}
        acts={{
          onStep: stepBy,
          onDecide: decide,
          onReason: reason,
          onNote: (text) => upd((x) => ({ ...x, note: text })),
          onNoteDone: () => {
            noteRef.current?.blur();
            rootRef.current?.focus({ preventScroll: true });
          },
          onUndo: undo,
          onCommit: () => void commit(),
        }}
      />
    </div>
  );
}
