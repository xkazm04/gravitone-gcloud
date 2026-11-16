// THE STUDIO SECTION'S ADDRESS (spark audio-agent-studio): `/audio?s=studio&session=<id>
// [&agent=offline][&source=fixture]`. The studio has one view (stage S2 retired the layout switcher),
// so the URL carries only the conversation, the offline preview and where the turns come from: the
// ledger (live, the default) or the scripted sessions. An unknown value reads as the default, never a 404.
//
// Spark suno-api: Suno's sign-in comes back to `/audio?suno=connected` or `/audio?suno=error&reason=<its
// sentence>` (app/api/suno/callback/route.ts). The reason is read here, shown once, and never carried
// into the next href: it is the answer to one sign-in, not a place.

export type StudioSource = "live" | "fixture";

// Spark studio-to-release: one surface, three stages - make (the conversation), package (the release's steps beside
// it), release (its review and Calendar slots). `stage` and the open release `r` live in the URL, so a reload and
// the back button carry them; `pv` picks the packaging layout under test (split | dock) until the owner's pick.
export const STUDIO_STAGES = ["make", "package", "release"] as const;
export type StudioStage = (typeof STUDIO_STAGES)[number];
export const PACKAGING_VARIANTS = ["split", "dock"] as const;
export type PackagingVariant = (typeof PACKAGING_VARIANTS)[number];

export type StudioUrl = {
  readonly session: string | null;
  readonly offline: boolean;
  readonly source: StudioSource;
  /** Suno's sign-in refused, in its own words (absent: no sign-in came back, or it went). */
  readonly sunoError?: string;
  /** Absent: make. */
  readonly stage?: StudioStage;
  /** The release open in package / release (`rel-` + 12 hex); absent or null: none. */
  readonly release?: string | null;
  /** Absent: split. */
  readonly packaging?: PackagingVariant;
};

/** The most of a sign-in refusal the page shows (Suno's sentences are short). */
export const SUNO_REASON_MAX = 500;

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

export function parseStudioUrl(q: Readonly<Record<string, string | readonly string[] | undefined>>): StudioUrl {
  const session = one(q["session"]);
  const reason = one(q["suno"]) === "error" ? (one(q["reason"]) ?? "").trim().slice(0, SUNO_REASON_MAX) || "suno refused the sign-in" : undefined;
  return {
    session: session !== undefined && session !== "" ? session : null,
    offline: one(q["agent"]) === "offline",
    source: one(q["source"]) === "fixture" ? "fixture" : "live",
    stage: STUDIO_STAGES.find((x) => x === one(q["stage"])) ?? "make",
    release: /^rel-[0-9a-f]{12}$/.test(one(q["r"]) ?? "") ? (one(q["r"]) ?? null) : null,
    packaging: PACKAGING_VARIANTS.find((x) => x === one(q["pv"])) ?? "split",
    ...(reason !== undefined ? { sunoError: reason } : {}),
  };
}

export function studioHref(u: StudioUrl): string {
  const p = new URLSearchParams({ s: "studio" });
  if (u.session !== null) p.set("session", u.session);
  if (u.offline) p.set("agent", "offline");
  if (u.source === "fixture") p.set("source", "fixture");
  if (u.stage !== undefined && u.stage !== "make") p.set("stage", u.stage);
  if (u.release !== undefined && u.release !== null) p.set("r", u.release);
  if (u.packaging !== undefined && u.packaging !== "split") p.set("pv", u.packaging);
  return `/audio?${p.toString()}`;
}
