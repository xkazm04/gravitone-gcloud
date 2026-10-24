"use client";

// ALBUM · RENDER (STEPS-DESIGN §2 "album parts"; v1 MusicVideoFrames' EffectsStudio and
// MusicVideoExport). PRIMARY: the poster preview - the kept still animated by the sibling-owned
// compositor (lib/sound/mv/compositor.ts, CALLED here and never edited) - and
// the resolution. RAIL: the renders, each an mp4 blob. INSPECTOR: what the render waits on (the
// track, the kept still, the title). The render is the mv job behind its receipt; its progress
// is the view's running job, not v1's elapsed clock over one opaque request.
import { useEffect, useRef } from "react";

import { RENDER_RES, type PartView, type RenderData } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { clock } from "@gt/ui/components/part/part.ts";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";

import { DEFAULT_EFFECT_PARAMS, buildBloomTexture, computeEdgeMask, limitFlashRate, renderFrame } from "@/lib/sound/mv/compositor";

import type { EditorProps } from "./PartEditor.tsx";
import s from "./Cut.module.css";

const FPS = 30;

/** The poster as the export will draw it, frame by frame from the envelope (silent: still). */
function Preview({ blob, envelope }: { readonly blob: string; readonly envelope: readonly number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (canvas === null || ctx === null || ctx === undefined) return;
    let raf = 0;
    let stop = false;
    const img = new Image();
    img.onload = () => {
      if (stop) return;
      const probe = document.createElement("canvas");
      probe.width = img.naturalWidth;
      probe.height = img.naturalHeight;
      const pctx = probe.getContext("2d");
      if (pctx === null) return;
      pctx.drawImage(img, 0, 0);
      const mask = computeEdgeMask(pctx.getImageData(0, 0, probe.width, probe.height));
      const bloom = buildBloomTexture(mask, DEFAULT_EFFECT_PARAMS);
      const low = envelope.length > 0 ? limitFlashRate([...envelope], FPS) : [0];
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // The frame is the one closest to now at the envelope's FPS (renderFrame's contract), read
      // off the frame loop's own timestamp. Counting ticks instead played the envelope at the
      // display's refresh rate: twice the export's speed at 60 Hz, four times at 120.
      let t0: number | null = null;
      const tick = (now: number): void => {
        if (stop) return;
        t0 ??= now;
        const i = Math.floor(((now - t0) / 1000) * FPS);
        renderFrame(ctx, { poster: img, posterWidth: img.naturalWidth, posterHeight: img.naturalHeight, bloomTexture: bloom, seed: 7, effectParams: DEFAULT_EFFECT_PARAMS, fps: FPS, boundedLow: low, highBand: low, frameIndex: i % Math.max(1, low.length), reducedMotion: reduced, fit: "cover" });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    img.src = `/api/blob/${blob}`;
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
    };
  }, [blob, envelope]);
  return <canvas ref={ref} className={s.preview} width={960} height={540} aria-label="poster preview" />;
}

export function RenderEditor({ frame, send, busy, error, view }: EditorProps<PartView<"render">>) {
  const d: RenderData = view.data;
  return (
    <PartWorkspace
      {...frame}
      mode="part.render"
      rail={{
        label: "renders",
        children: (
          <div className={s.railHead}>
            {d.exports.length === 0 ? (
              <Empty label="nothing rendered yet" />
            ) : (
              <div className={s.sect}>
                {d.exports.map((e) => (
                  <div key={e.id} className={s.row}>
                    <span className={s.grow}>{e.label}</span>
                    {e.mode === "dry" && <Chip label="dry" casing="lower" />}
                    {e.blob !== undefined && <Button label="mp4" size="sm" href={`/api/blob/${e.blob}`} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        ),
      }}
      primary={{
        label: "poster",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            <div className={s.bar}>
              <Seg label="resolution" options={RENDER_RES.map((r) => ({ value: r, label: r }))} value={d.res} onChange={(res) => !busy && send({ op: "render-res", res })} />
              {d.track !== null && <span className={s.mono}>{`${d.track.title}${d.track.durationS === null ? "" : ` · ${clock(d.track.durationS)}`}`}</span>}
            </div>
            {d.still?.blob !== undefined ? <Preview blob={d.still.blob} envelope={d.envelope} /> : <div className={`${s.preview} ${s.previewEmpty}`} role="img" aria-label="no kept still" />}
          </>
        ),
      }}
      inspector={{
        label: "inputs",
        children: (
          <div className={s.sect}>
            <h3 className={s.h}>track</h3>
            <p className={s.work}>{d.track?.title ?? "—"}</p>
            <h3 className={s.h}>still</h3>
            <p className={s.work}>{d.still?.label ?? "—"}</p>
            <h3 className={s.h}>title</h3>
            <p className={s.work}>{d.words?.title ?? "—"}</p>
          </div>
        ),
      }}
    />
  );
}
