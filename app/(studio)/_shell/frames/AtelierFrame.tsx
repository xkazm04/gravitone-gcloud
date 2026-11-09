// A style's atelier before its read (library/style/[id]/_atelier/Atelier.tsx): head, the primary
// column beside the dossier, the foot.
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import s from "../../library/style/[id]/_atelier/Atelier.module.css";
import { Frame } from "./Frame.tsx";
import p from "./frames.module.css";

export function AtelierFrame() {
  return (
    <Frame name="style" className={s.ws}>
      <div className={s.head}>
        <div className={`${s.crumbs} ${p.control}`} />
      </div>
      <div className={s.body}>
        <div className={s.primary}>
          <Ghost count={10} label="trials and proofs" />
        </div>
        <div className={s.dossier}>
          <Ghost count={6} label="dossier" />
        </div>
      </div>
      <div className={s.foot}>
        <div className={p.chip} />
      </div>
    </Frame>
  );
}
