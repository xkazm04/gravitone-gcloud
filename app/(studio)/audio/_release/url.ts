// THE RELEASE TAB'S URL (spark audio-distribution, S1): `/audio?s=release` plus the layout (`v`, one
// of the three variants under test), the side (`source=real`; the fixture is S1's default) and the
// release open on first paint (`r`). One parser and one encoder.
import { RELEASE_VARIANTS, type ReleaseUrl } from "./_port/port.ts";

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

export function parseReleaseUrl(q: Query): ReleaseUrl {
  const v = one(q["v"]);
  const r = one(q["r"]);
  return {
    source: one(q["source"]) === "real" ? "real" : "fixture",
    variant: RELEASE_VARIANTS.find((x) => x === v) ?? "desk",
    release: r !== undefined && /^rel-[0-9a-f]{12}$/.test(r) ? r : null,
  };
}

export function releaseHref(u: ReleaseUrl): string {
  const p = new URLSearchParams({ s: "release" });
  if (u.variant !== "desk") p.set("v", u.variant);
  if (u.source === "real") p.set("source", "real");
  if (u.release !== null) p.set("r", u.release);
  return `/audio?${p.toString()}`;
}
