"use client";

/**
 * DevInspector — click a component, get its source path.
 *
 * The point: pointing an AI coding CLI at the exact file behind a pixel, without
 * hunting for it. Hover any part of the running app, right-click, and
 * `app/_phases/frames/FrameBoard.tsx:118` is on the clipboard.
 *
 * Usage:
 *   1. Launch with `npm run dev:inspect` (sets DEV_INSPECT=1, which registers
 *      the Turbopack loader that stamps host elements with `data-loc`).
 *   2. Press `;` for keyboard mode, then `i` to arm the inspector.
 *   3. Hover highlights the element; RIGHT-CLICK copies the path (left-click is
 *      left alone, so the app stays usable while armed). The default copy is the
 *      CALL SITE — the step/page file that used the primitive, not
 *      `components/ui/Primitives.tsx`. Alt+right-click copies the innermost
 *      element, and every enclosing file is one click away in the HUD.
 *   4. `Esc` exits.
 *
 * TWO GATES, and the outer one is a build-time switch. app/layout.tsx mounts
 * this behind `process.env.NODE_ENV === "development"`, which Next inlines as a
 * literal, so a production build drops the import and this module never ships —
 * the same shape components/ui/HarnessBridge.tsx documents at length. The inner
 * gate is DEV_INSPECT: without it there are no `data-loc` attributes at all, and
 * the HUD says so rather than pretending to work.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { buildChain, dedupeChain, pickDefaultIndex, type LocEntry } from "./devLocate";
import { HighlightBox, InspectorHud, NavHint, SourceLabel, Z } from "./devInspectorUi";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* not permitted (insecure origin, unfocused document) — try the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

type Mode = "off" | "nav" | "armed";

interface HoverState {
  chain: LocEntry[];
  pointerRect: DOMRect;
  targetRect: DOMRect;
  defaultIndex: number;
}

export default function DevInspector() {
  const [mode, setMode] = useState<Mode>("off");
  const [hover, setHover] = useState<HoverState | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(true);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const doCopy = useCallback(async (loc: string) => {
    const ok = await copyText(loc);
    setCopyOk(ok);
    setCopied(loc);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 1800);
  }, []);

  // `;` enters keyboard mode, then `i` arms the inspector; Esc exits. Two keys
  // rather than one so a single stray keystroke never arms an overlay that
  // swallows right-click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === ";") {
        e.preventDefault();
        clearTimeout(navTimer.current);
        setMode((m) => {
          if (m === "nav") return "off";
          if (m === "armed") return "armed"; // already inspecting; ignore
          navTimer.current = setTimeout(() => {
            setMode((cur) => (cur === "nav" ? "off" : cur));
          }, 2000);
          return "nav";
        });
        return;
      }

      if ((e.key === "i" || e.key === "I") && mode === "nav") {
        e.preventDefault();
        clearTimeout(navTimer.current);
        setMode("armed");
        return;
      }

      if (e.key === "Escape" && mode !== "off") {
        clearTimeout(navTimer.current);
        setMode("off");
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mode]);

  // Hover highlight + right-click copy, only while armed.
  useEffect(() => {
    if (mode !== "armed") return;

    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";

    const insideHud = (t: EventTarget | null) =>
      t instanceof Element && t.closest("[data-devinspector]") !== null;

    const onMove = (e: MouseEvent) => {
      if (insideHud(e.target)) return; // keep the last highlight while over the HUD
      const chain = buildChain(e.target as Element | null);
      if (chain.length === 0 || !chain[0]) {
        setHover(null);
        return;
      }
      const di = pickDefaultIndex(chain);
      setHover({
        chain,
        pointerRect: chain[0].el.getBoundingClientRect(),
        targetRect: (chain[di] ?? chain[0]).el.getBoundingClientRect(),
        defaultIndex: di,
      });
    };

    const onContextMenu = (e: MouseEvent) => {
      if (insideHud(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const chain = buildChain(e.target as Element | null);
      if (chain.length === 0 || !chain[0]) return;
      const di = pickDefaultIndex(chain);
      const pick = e.altKey ? chain[0] : (chain[di] ?? chain[0]);
      void doCopy(pick.loc);
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      document.body.style.cursor = prevCursor;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      setHover(null);
    };
  }, [mode, doCopy]);

  useEffect(
    () => () => {
      clearTimeout(copiedTimer.current);
      clearTimeout(navTimer.current);
    },
    [],
  );

  // No hydration gate is needed: `mode` starts "off" on the server and the
  // client alike, and only leaves "off" through a client-side keydown, so the
  // document.body portals below are unreachable during SSR/hydration.
  if (mode === "off") return null;

  if (mode === "nav") {
    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: Z, pointerEvents: "none" }}>
        <NavHint />
      </div>,
      document.body,
    );
  }

  // armed
  const mappingOn = document.querySelector("[data-loc]") !== null;
  const defaultLoc =
    hover && hover.chain[hover.defaultIndex] ? hover.chain[hover.defaultIndex]!.loc : null;
  const crumbs = hover ? dedupeChain(hover.chain) : [];

  return createPortal(
    <div data-devinspector style={{ position: "fixed", inset: 0, zIndex: Z, pointerEvents: "none" }}>
      {hover && hover.defaultIndex !== 0 && (
        <HighlightBox rect={hover.pointerRect} variant="pointer" />
      )}
      {hover && <HighlightBox rect={hover.targetRect} variant="target" />}
      {hover && defaultLoc && <SourceLabel rect={hover.pointerRect} loc={defaultLoc} />}

      <InspectorHud
        copied={copied}
        copyOk={copyOk}
        mappingOn={mappingOn}
        crumbs={crumbs}
        defaultLoc={defaultLoc}
        onCopy={doCopy}
      />
    </div>,
    document.body,
  );
}
