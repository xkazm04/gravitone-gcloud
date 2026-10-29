// THE STUDIO SECTION'S ADDRESS (spark audio-agent-studio): `/audio?s=studio&session=<id>
// [&agent=offline][&source=fixture]`. The studio has one view (stage S2 retired the layout switcher),
// so the URL carries only the conversation, the offline preview and where the turns come from: the
// ledger (live, the default) or the scripted sessions. An unknown value reads as the default, never a 404.

export type StudioSource = "live" | "fixture";

export type StudioUrl = { readonly session: string | null; readonly offline: boolean; readonly source: StudioSource };

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

export function parseStudioUrl(q: Readonly<Record<string, string | readonly string[] | undefined>>): StudioUrl {
  const session = one(q["session"]);
  return { session: session !== undefined && session !== "" ? session : null, offline: one(q["agent"]) === "offline", source: one(q["source"]) === "fixture" ? "fixture" : "live" };
}

export function studioHref(u: StudioUrl): string {
  const p = new URLSearchParams({ s: "studio" });
  if (u.session !== null) p.set("session", u.session);
  if (u.offline) p.set("agent", "offline");
  if (u.source === "fixture") p.set("source", "fixture");
  return `/audio?${p.toString()}`;
}
