"use client";

// THE LAST ACT'S WORDS - st.ui.toast, shown 3.2 s (the winner's WS.toast), and the side's last refusal in its own
// words (st.ui.error) as an ErrorLine that stays until it is dismissed: a refusal is never a toast that slips away.

import { useEffect, useState } from "react";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import type { CanvasStore } from "../store.ts";
import { useCanvas } from "../useCanvas.ts";
import { cx, Gl } from "./kit.tsx";
import ts from "./toast.module.css";

const SHOW_MS = 3200;

function clearError(st: CanvasStore): void {
  st.ui.error = null;
  st.changed("ui");
}

export function Toast() {
  const st = useCanvas();
  const toast = st.ui.toast;
  const error = st.ui.error;
  // The `at` of the last toast whose time ran out.
  const [gone, setGone] = useState(0);
  const at = toast?.at ?? 0;
  useEffect(() => {
    if (at === 0) return;
    const t = setTimeout(() => setGone(at), Math.max(0, at + SHOW_MS - Date.now()));
    return () => clearTimeout(t);
  }, [at]);
  const fresh = toast !== null && gone !== toast.at && toast.text !== error;
  const dismiss = (): void => clearError(st);
  return (
    <div data-role="toast" className={cx(ts.toast, (fresh || error !== null) && ts.on)} role="status" aria-live="polite">
      {fresh && <div>{toast.text}</div>}
      {error !== null && (
        <div className={ts.err}>
          <ErrorLine message={error} />
          <button type="button" aria-label="Dismiss" onClick={dismiss}>
            <Gl name="x" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
