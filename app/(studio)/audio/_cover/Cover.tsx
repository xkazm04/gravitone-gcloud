"use client";

// THE COVER DESK (spark track-mirror-studio, WP3): an uploaded song, a section of it, a style; five YuE2 takes
// heard against the section; a winner picked and downloaded; the Suno remix brought back with its style. The
// island holds only the owner's unsaved edits and the players; every write is an act or a route, and the view
// is re-read after it (./desk/useDesk.ts). The desk itself is ./desk/sleeve/SleeveDesk.tsx.
import type { CoverActs, CoverDeskView } from "./contract.ts";
import { SleeveDesk } from "./desk/sleeve/SleeveDesk.tsx";
import { useDesk } from "./desk/useDesk.ts";
import s from "./desk/cover.module.css";

export function CoverDesk({ view, acts }: { readonly view: CoverDeskView; readonly acts: CoverActs }) {
  const desk = useDesk(view, acts);
  return (
    <div className={s.section}>
      <SleeveDesk desk={desk} />
    </div>
  );
}
