// Runs before its read (projects/runs/_runs/Runs.tsx): the compositions list | the head, then the
// dayline beside the inspector.
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import plan from "../../projects/_plan/Plan.module.css";
import s from "../../projects/runs/_runs/Runs.module.css";
import { Frame } from "./Frame.tsx";
import p from "./frames.module.css";

export function RunsFrame() {
  return (
    <Frame name="runs" className={s.proj}>
      <aside className={plan.plist}>
        <div className={p.pad}>
          <Ghost count={10} label="compositions" />
        </div>
      </aside>
      <section className={s.pmain}>
        <div className={s.ptop}>
          <Ghost count={2} label="runs head" />
        </div>
        <div className={s.runs}>
          <div className={s.dl}>
            <div className={s.dlbar}>
              <Ghost label="zoom" />
            </div>
            <div className={`${p.pad} ${p.fill}`}>
              <Ghost fill count={6} label="dayline" />
            </div>
          </div>
          <aside className={s.inspector}>
            <div className={p.pad}>
              <Ghost count={6} label="inspector" />
            </div>
          </aside>
        </div>
      </section>
    </Frame>
  );
}
