// A project's plan before its read (projects/_plan/Plan.tsx), which is also what /projects opens
// on: the compositions list | the plan's head, then its parts beside the summary.
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import s from "../../projects/_plan/Plan.module.css";
import { Frame } from "./Frame.tsx";
import p from "./frames.module.css";

export function PlanFrame() {
  return (
    <Frame name="plan" className={s.proj}>
      <aside className={s.plist}>
        <div className={p.pad}>
          <Ghost count={10} label="compositions" />
        </div>
      </aside>
      <section className={s.pmain}>
        <div className={s.ptop}>
          <Ghost count={2} label="plan head" />
        </div>
        <div className={s.plan}>
          <div className={s.planMain}>
            <Ghost count={8} label="parts" />
          </div>
          <div className={s.psum}>
            <Ghost count={5} label="summary" />
          </div>
        </div>
      </section>
    </Frame>
  );
}
