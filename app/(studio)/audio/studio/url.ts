// THE STUDIO SECTION'S ADDRESS (spark audio-agent-studio): `/audio?s=studio&session=<id>
// [&agent=offline][&source=fixture]`. The studio has one view (stage S2 retired the layout switcher),
// so the URL carries only the conversation, the offline preview and where the turns come from: the
// ledger (live, the default) or the scripted sessions. An unknown value reads as the default, never a 404.

export type StudioSource = "live" | "fixture";

/** Spark suno-advisor S1: three compositions of the Suno pieces behind `&v=`; `thread` (the default) is omitted. */
export const STUDIO_VIEWS = ["thread", "sheet", "board"] as const;
export type StudioView = (typeof STUDIO_VIEWS)[number];

export type StudioUrl = { readonly session: string | null; readonly offline: boolean; readonly source: StudioSource; readonly view?: Exclude<StudioView, "thread"> };

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

export function parseStudioUrl(q: Readonly<Record<string, string | readonly string[] | undefined>>): StudioUrl {
  const session = one(q["session"]);
  const v = one(q["v"]);
  const view: { view?: "sheet" | "board" } = v === "sheet" || v === "board" ? { view: v } : {};
  return { session: session !== undefined && session !== "" ? session : null, offline: one(q["agent"]) === "offline", source: one(q["source"]) === "fixture" ? "fixture" : "live", ...view };
}

export function studioHref(u: StudioUrl): string {
  const p = new URLSearchParams({ s: "studio" });
  if (u.session !== null) p.set("session", u.session);
  if (u.offline) p.set("agent", "offline");
  if (u.source === "fixture") p.set("source", "fixture");
  if (u.view !== undefined) p.set("v", u.view);
  return `/audio?${p.toString()}`;
}
