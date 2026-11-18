// The idea form's pure half: the limits it mirrors (lib/reel/state.ts parseIdea holds them; a test pins the two
// together) and the slug a title suggests (lib/reel/store.ts isReelSlug's alphabet, at most 60).

export const IDEA_LIMITS = { title: 70, hook: 90, path: 40 } as const;

/** A title as a reel slug: lower case, letters and digits joined by single dashes, at most 60. */
export function slugOf(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}
