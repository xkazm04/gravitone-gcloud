// THE REELS' CONTEXT COLUMN, as the shell's model (../../_shell/navModel.ts Rooms): the overview and the new-reel
// form as rooms, and on a reel's page the reel itself as the open room with its walk under it - the numbered
// descent the audio studio's stages use (ContextColumn's Stages), one stage per step, the reel's own stage lit. A
// redo is drawn at authoring (it walks back there), a drop at the stage it was dropped from: review.
import type { FilmStage } from "@/lib/reel/film";

import type { NavItem, Rooms } from "../../_shell/navModel.ts";
import { reelHref, STAGE_LOOK, WALK } from "./facts.ts";

const AT: Partial<Record<FilmStage, FilmStage>> = { redo: "authoring", dropped: "review" };

/** Where a stage is worked on the reel page: the players for a film to judge or a released one, else the steps. */
export const stepAnchor = (stage: FilmStage): "review" | "steps" => (stage === "review" || stage === "released" ? "review" : "steps");

export function reelsRooms(at: "all" | "new" | { readonly slug: string; readonly title: string; readonly stage: FilmStage }): Rooms {
  const base: NavItem[] = [
    { id: "all", label: "Reels", href: "/reels", glyph: "overview", current: at === "all" },
    { id: "new", label: "New", href: "/reels/new", glyph: "compose", current: at === "new" },
  ];
  if (typeof at === "string") return { title: "Reels", rooms: base, groups: [{ id: "reels", label: null, items: base }], stages: null, kinds: null };
  const lit = AT[at.stage] ?? at.stage;
  const href = reelHref(at.slug);
  const reel: NavItem = { id: at.slug, label: at.title, href, glyph: "release", current: true };
  const stages = WALK.map((st): NavItem => ({ id: st, label: STAGE_LOOK[st].label.charAt(0).toUpperCase() + STAGE_LOOK[st].label.slice(1), href: `${href}#${stepAnchor(st)}`, current: st === lit }));
  return { title: "Reels", rooms: [...base, reel], groups: [{ id: "reels", label: null, items: base }, { id: "reel", label: "Reel", items: [reel] }], stages, kinds: null };
}
