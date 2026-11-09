// The Library before its read (library/_library/Library.tsx): rail | results | detail, the route's
// own grid, with the detail column open as it opens on a wide screen (it folds to a drawer at the
// same widths, through the same classes).
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import l from "../../library/_library/library.module.css";
import { Frame } from "./Frame.tsx";
import p from "./frames.module.css";

export function LibraryFrame() {
  return (
    <Frame name="library" className={l.lib}>
      <aside className={l.nav}>
        <div className={p.pad}>
          <Ghost count={12} label="library vocabulary" />
        </div>
      </aside>
      <section className={l.center}>
        <div className={l.lhead} />
        <div className={l.tool}>
          <div className={l.search}>
            <Ghost label="library tools" />
          </div>
        </div>
        <div className={l.vp}>
          <div className={p.pad}>
            <Ghost count={12} label="results" />
          </div>
        </div>
      </section>
      <aside className={l.det}>
        <div className={`${p.pad} ${p.fill}`}>
          <Ghost fill label="detail" />
        </div>
      </aside>
    </Frame>
  );
}
