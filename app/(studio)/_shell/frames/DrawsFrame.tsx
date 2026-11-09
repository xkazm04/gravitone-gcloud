// The local draws before the disk is listed (local-draws/page.tsx): the page's column of runs.
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import s from "../../local-draws/Draws.module.css";
import { Frame } from "./Frame.tsx";

export function DrawsFrame() {
  return (
    <Frame name="local draws" className={s.page}>
      <Ghost count={8} label="draws" />
    </Frame>
  );
}
