// /scout/ventures while the slate is read: the shared ghost row.
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import s from "../_scout/scout.module.css";

export default function Loading() {
  return (
    <div className={s.page} data-state="loading">
      <Ghost count={4} label="loading ventures" />
    </div>
  );
}
