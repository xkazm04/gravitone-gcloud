// A part's editor before its read (projects/[id]/[part]/_edit/PartEditor.tsx): the shared
// PartWorkspace grid - head, rail | primary | inspector, then the tabs and keys at its foot. The
// editors' own chunk wait (editors.tsx `Held`) draws the same grid once the part is known.
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";
import s from "@gt/ui/components/part/Part.module.css";

import { Frame } from "./Frame.tsx";
import p from "./frames.module.css";

export function PartFrame() {
  return (
    <Frame name="part" className={s.ws}>
      <div className={s.head}>
        <div className={`${s.crumbs} ${p.control}`} />
      </div>
      <div className={s.body}>
        <section className={s.rail}>
          <div className={p.pad}>
            <Ghost count={6} label="items" />
          </div>
        </section>
        <section className={s.primary}>
          <Ghost fill label="editor" />
        </section>
        <aside className={s.inspector}>
          <Ghost count={4} label="inspector" />
        </aside>
      </div>
      <div className={s.foot}>
        <div className={p.tabs}>
          <Ghost fill label="tabs" />
        </div>
        <div className={`${s.keys} ${p.chip}`} />
      </div>
    </Frame>
  );
}
