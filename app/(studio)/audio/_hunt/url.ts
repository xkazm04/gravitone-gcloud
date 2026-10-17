// THE HUNT'S PLACE IN THE URL (Phase 6, L65): `/audio?s=hunt` (+ `&kind=sfx`) is the section and
// `&h=<id>` the hunt it opens, so a link to one hunt survives a reload and the back button (v1's
// `?h=` deep link, kept). The lessons section is `/audio?s=lessons`. Built here rather than by the
// desk's `deskHref` because the desk's URL carries no hunt.
export type HuntKind = "music" | "sfx";

export function huntHref(kind: HuntKind, h: string | null): string {
  const p = new URLSearchParams({ s: "hunt" });
  if (kind !== "music") p.set("kind", kind);
  if (h !== null) p.set("h", h);
  return `/audio?${p.toString()}`;
}

export function lessonsHref(kind: HuntKind): string {
  return kind === "music" ? "/audio?s=lessons" : "/audio?s=lessons&kind=sfx";
}

/** `?h=`, held to the store's id shape; anything else names no hunt. */
export function huntParam(q: Readonly<Record<string, string | readonly string[] | undefined>>): string | null {
  const v = q["h"];
  const one = typeof v === "string" ? v : v?.[0];
  return one !== undefined && /^[A-Za-z0-9_-]{1,80}$/.test(one) ? one : null;
}
