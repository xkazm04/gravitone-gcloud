// THE STUDIO SECTION'S ADDRESS (spark audio-agent-studio): `/audio?s=studio&v=<variant>&session=<id>
// [&agent=offline]`. The variant and the session live in the URL so a link, a reload and the back
// button carry them; an unknown value reads as the default, never a 404.

export const VARIANTS = [
  { id: "desk", label: "desk" },
  { id: "canvas", label: "canvas" },
  { id: "stage", label: "stage" },
] as const;
export type VariantId = (typeof VARIANTS)[number]["id"];

export type StudioUrl = { readonly variant: VariantId; readonly session: string | null; readonly offline: boolean };

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

export function parseStudioUrl(q: Readonly<Record<string, string | readonly string[] | undefined>>): StudioUrl {
  const v = one(q["v"]);
  const session = one(q["session"]);
  return { variant: VARIANTS.find((x) => x.id === v)?.id ?? "desk", session: session !== undefined && session !== "" ? session : null, offline: one(q["agent"]) === "offline" };
}

export function studioHref(u: StudioUrl): string {
  const p = new URLSearchParams({ s: "studio" });
  if (u.variant !== "desk") p.set("v", u.variant);
  if (u.session !== null) p.set("session", u.session);
  if (u.offline) p.set("agent", "offline");
  return `/audio?${p.toString()}`;
}
