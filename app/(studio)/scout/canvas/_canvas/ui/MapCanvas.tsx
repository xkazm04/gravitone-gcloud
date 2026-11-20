"use client";

// THE MAP - the <canvas> island. The engine (../render/mount.ts) runs the frame loop and the pointer; this component
// mounts it, and draws the tip under the pointer with the hovered thing's words and the key that acts.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { mountMap, openTool } from "../render/mount.ts";
import type { Tip } from "../render/tip.ts";
import { useCanvasStore } from "../useCanvas.ts";
import { cx, Kbd } from "./kit.tsx";
import m from "./map.module.css";

export { openTool };

export function MapCanvas() {
  const st = useCanvasStore();
  const cvRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const mouse = useRef<[number, number]>([0, 0]);
  const [tip, setTip] = useState<Tip | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pointy, setPointy] = useState(false);

  const placeTip = (): void => {
    const el = tipRef.current;
    if (el === null) return;
    const [x, y] = mouse.current;
    el.style.left = `${Math.min(x + 16, window.innerWidth - el.offsetWidth - 10)}px`;
    el.style.top = `${Math.min(y + 16, window.innerHeight - el.offsetHeight - 10)}px`;
  };
  useLayoutEffect(placeTip, [tip]);

  useEffect(() => {
    const cv = cvRef.current;
    if (cv === null) return;
    return mountMap(st, cv, { setTip, setDragging, setPointy, placeTip, mouse });
    // placeTip reads refs only; the engine mounts once per store.
  }, [st]);

  return (
    <>
      <canvas ref={cvRef} data-role="map" tabIndex={0} aria-label="Studio watershed map" className={cx(m.map, dragging && m.drag, pointy && m.pointy)} />
      {tip !== null && (
        <div ref={tipRef} className={m.tip} role="tooltip">
          <div className={m.l}>{tip.l}</div>
          <div className={m.m}>{tip.m}</div>
          {tip.k !== null && (
            <div className={m.k}>
              <Kbd verb={tip.k.verb} />
              {tip.k.word !== "" && tip.k.word}
            </div>
          )}
        </div>
      )}
    </>
  );
}
