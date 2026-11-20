// THE RELEASE TAB'S URL (spark audio-distribution): `/audio?s=release` plus the side (the stored releases by default
// since spark studio-to-release persisted them; the scripted record is `source=fixture`) and the release open on first paint (`r`). One
// parser and one encoder.
import type { ReleaseUrl } from "./_port/port.ts";

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

export function parseReleaseUrl(q: Query): ReleaseUrl {
  const r = one(q["r"]);
  return {
    source: one(q["source"]) === "fixture" ? "fixture" : "real",
    release: r !== undefined && /^rel-[0-9a-f]{12}$/.test(r) ? r : null,
  };
}

export function releaseHref(u: ReleaseUrl): string {
  const p = new URLSearchParams({ s: "release" });
  if (u.source === "fixture") p.set("source", "fixture");
  if (u.release !== null) p.set("r", u.release);
  return `/audio?${p.toString()}`;
}
