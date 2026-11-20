"use client";

// THE CANVAS'S HEADER - the winner's <header> (index.html + chrome.js) as an in-page bar across the top of the canvas
// root, var(--hdr-h) tall: the brand, where the camera stands (Crumbs), what waits (Inbox), Find (Search), the keymap
// sheet's toggle and the next night (the brief desk), with the count of notes it will carry.

import { useCanvas } from "../useCanvas.ts";
import { Crumbs } from "./Crumbs.tsx";
import { Inbox } from "./Inbox.tsx";
import { Gl } from "./kit.tsx";
import { setKeysOpen } from "./KeysSheet.tsx";
import { Search } from "./Search.tsx";
import t from "./toolbar.module.css";

export { openFind } from "./Search.tsx";

export function Toolbar() {
  const st = useCanvas();
  const n = st.ui.notes.length;
  const toggleKeys = (): void => setKeysOpen(st, !st.ui.keysOpen);
  return (
    <header className={t.bar}>
      <div className={t.brand}>
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <path d="M2 6c4-3 6 3 10 0s6 3 8 1" stroke="var(--cyan)" strokeWidth="1.6" fill="none" />
          <path d="M2 11c4-3 6 3 10 0s6 3 8 1" stroke="var(--muted)" strokeWidth="1.6" fill="none" />
          <path d="M2 16c4-3 6 3 10 0" stroke="var(--muted)" strokeWidth="1.6" fill="none" />
          <rect x="15" y="12.500" width="2.500" height="7" fill="var(--wall-hi)" />
        </svg>
        <span className={t.nm}>Scout</span>
      </div>
      <Crumbs />
      <Inbox />
      <Search />
      <button type="button" className={t.iconbtn} aria-label="Keys" aria-pressed={st.ui.keysOpen} onClick={toggleKeys}>
        <Gl name="keys" size={16} />
      </button>
      <button type="button" className={t.nightBtn} onClick={() => st.openSurface({ kind: "brief" })}>
        <span className={t.run} />
        <Gl name="moon" size={16} />
        <span>Next night</span>
        <b>{n > 0 ? `${n} notes` : ""}</b>
      </button>
    </header>
  );
}
