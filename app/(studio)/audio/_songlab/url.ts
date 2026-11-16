// THE SONG LAB'S URL (spark yue2-song-lab S2): `/audio?s=songlab` plus the open draw (`d`), the
// match open in the booth (`m`, `<round>-<slot>`), the field sheet (`f=1`), the fixture side
// (`source=fixture`, the studio's word) and, on the fixture only, the agent drawn away (`away=1`).
// One parser and one encoder, so a link, a reload and the back button carry the desk.
import type { SongLabUrl } from "./_port/port.ts";

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

export function parseSongLabUrl(q: Query): SongLabUrl {
  const d = one(q["d"]);
  const m = one(q["m"]);
  const source = one(q["source"]) === "fixture" ? "fixture" : "live";
  return {
    source,
    ...(d !== undefined && /^[0-9a-f]{12}$/.test(d) ? { draw: d } : {}),
    ...(m !== undefined && /^(R16|QF|SF|F)-\d{1,2}$/.test(m) ? { match: m } : {}),
    field: one(q["f"]) === "1",
    ...(source === "fixture" && one(q["away"]) === "1" ? { away: true } : {}),
  };
}

export function songLabHref(u: SongLabUrl): string {
  const p = new URLSearchParams({ s: "songlab" });
  if (u.source === "fixture") p.set("source", "fixture");
  if (u.draw !== undefined) p.set("d", u.draw);
  if (u.match !== undefined) p.set("m", u.match);
  if (u.field) p.set("f", "1");
  if (u.away === true) p.set("away", "1");
  return `/audio?${p.toString()}`;
}
