"use client";

// THE COVER DESK (spark track-mirror-studio, WP3): an uploaded song, a section of it, a style; five YuE2 takes
// heard against the section; a winner picked and downloaded; the Suno remix brought back with its style. The
// island holds only the owner's unsaved edits and the players; every write is an act or a route, and the view
// is re-read after it (./desk/useDesk.ts). The desk itself is ./desk/Layouts.tsx `Baseline`, a column of steps.
//
// TODO(prototype, 2026-11-08): consolidate the cover desk switcher. `?v=` picks the baseline or one of three
// directional variants (./desk/v1, v2, v3), each handed exactly the baseline's props; an unknown value is the
// baseline. The rail's links keep `cover` and `fixture`. Phase 5 of the prototype skill deletes this rail, the
// losing variants and the `v` that ./desk/useDesk.ts carries.
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";

import type { CoverActs, CoverDeskView } from "./contract.ts";
import { Baseline, type DeskProps } from "./desk/Layouts.tsx";
import { useDesk } from "./desk/useDesk.ts";
import { DeskV1 } from "./desk/v1/Desk.tsx";
import { DeskV2 } from "./desk/v2/Desk.tsx";
import { DeskV3 } from "./desk/v3/Desk.tsx";
import s from "./desk/cover.module.css";

const VARIANTS = ["baseline", "v1", "v2", "v3"] as const;
type Variant = (typeof VARIANTS)[number];
const BODY: Readonly<Record<Variant, (p: DeskProps) => ReactNode>> = { baseline: Baseline, v1: DeskV1, v2: DeskV2, v3: DeskV3 };

export function CoverDesk({ view, acts }: { readonly view: CoverDeskView; readonly acts: CoverActs }) {
  const desk = useDesk(view, acts);
  const q = useSearchParams();
  const variant = VARIANTS.find((v) => v === q.get("v")) ?? "baseline";
  const tabs = VARIANTS.map((v) => {
    const p = new URLSearchParams();
    p.set("s", "cover");
    for (const k of ["cover", "fixture"]) {
      const x = q.get(k);
      if (x !== null) p.set(k, x);
    }
    if (v !== "baseline") p.set("v", v);
    return { id: v, label: v, href: `/audio?${p.toString()}` };
  });
  const Body = BODY[variant];
  return (
    <div className={s.section}>
      <div className={s.bar}>
        <TabRail label="cover desk variant" mode="audio" tabs={tabs} current={variant} />
      </div>
      <Body desk={desk} view={desk.view} />
    </div>
  );
}
