"use client";

// WHAT THE SHELL CAN READ, AND WHAT IT CAN CALL — the canvas's two outward
// surfaces, which are deliberately the only two.
//
// READ: one `CanvasStatus` per change, through `onStatus`. It carries the load's
// honesty channels (`notes.hidden`, `notes.damaged`, `notes.degraded`) because a
// SUCCESSFUL load with something unreadable inside it is not an error and must
// not be drawn as one — see ./index.ts, which states what a shell owes each.
//
// CALL: `PipelineHandle`. The methods are routed through a ref that is rewritten
// every render, so the handle's own identity never changes — a shell holding it
// in a dependency array does not re-run on every camera move. `reload` is the
// exception: it is already stable, and it is the only one the data layer owns.
//
// `onStatus` is read through an effect event, so a shell that keeps the answer in
// state does not re-render the canvas a second time for its own update.

import { useEffect, useEffectEvent, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";

import type { Layout } from "./geometry";
import type { CanvasStatus, ChoreoState, PipelineHandle } from "./types";
import type { PipelineData } from "./usePipelineData";
import type { Viewport } from "./useViewport";

export function useCanvasHandle({
  data,
  layout,
  viewport,
  selected,
  mountedCount,
  choreo,
  onStatus,
  apiRef,
}: {
  data: PipelineData;
  layout: Layout;
  viewport: Viewport;
  selected: ReadonlySet<string>;
  mountedCount: number;
  choreo: ChoreoState;
  onStatus?: (s: CanvasStatus) => void;
  apiRef?: React.Ref<PipelineHandle>;
}) {
  const status = useMemo<CanvasStatus>(
    () => ({
      loading: data.loading,
      error: data.error,
      notes: data.notes,
      total: layout.total,
      counts: layout.stageCounts,
      selected: selected.size,
      mounted: mountedCount,
      choreo,
    }),
    [data.loading, data.error, data.notes, layout, selected, mountedCount, choreo],
  );

  const emitStatus = useEffectEvent((s: CanvasStatus) => onStatus?.(s));
  useEffect(() => {
    emitStatus(status);
  }, [status]);

  const implRef = useRef(viewport);
  useLayoutEffect(() => {
    implRef.current = viewport;
  });
  useImperativeHandle(
    apiRef,
    () => ({
      reload: data.reload,
      fit: () => implRef.current.fit(),
      zoomBy: (f: number) => implRef.current.zoomBy(f),
      reveal: (id: string) => implRef.current.reveal(id),
      camera: () => implRef.current.camera(),
    }),
    [data.reload],
  );
}
