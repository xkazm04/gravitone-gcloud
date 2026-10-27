// THE NAMES A COMPOSE OR A FLOOR LAUNCH MINTS - pure, one copy for both sides of the port: the
// fixture (./fixtureActs.ts) and the real side (./real.ts, ./realRead.ts) spelled each of these
// twice, and the two slugs had already drifted (one cut at 40 and left a trailing dash).

/** The first sentence of a composer's text: a Floor run's name, as the prototype drew it. */
export function firstSentence(text: string, fallback: string): string {
  const t = text.trim().split(/(?<=[.!?…])\s/)[0]?.trim() ?? "";
  return t === "" ? fallback : t.length > 80 ? `${t.slice(0, 79)}…` : t;
}

/** A project id's stem: lowercase words joined by one dash, at most 40 characters, no dash at either end. */
export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "") || "project";
