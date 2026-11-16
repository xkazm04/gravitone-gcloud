// THE RELEASE TAB'S URL (spark audio-distribution): `/audio?s=release` plus the side (`source=real`;
// the fixture is the default until releases persist) and the release open on first paint (`r`). One
// parser and one encoder.
import type { ReleaseUrl } from "./_port/port.ts";

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

export function parseReleaseUrl(q: Query): ReleaseUrl {
  const r = one(q["r"]);
  return {
    source: one(q["source"]) === "real" ? "real" : "fixture",
    release: r !== undefined && /^rel-[0-9a-f]{12}$/.test(r) ? r : null,
  };
}

export function releaseHref(u: ReleaseUrl): string {
  const p = new URLSearchParams({ s: "release" });
  if (u.source === "real") p.set("source", "real");
  if (u.release !== null) p.set("r", u.release);
  return `/audio?${p.toString()}`;
}
