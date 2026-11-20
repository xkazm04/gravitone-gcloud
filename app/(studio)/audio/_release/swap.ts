// A RELEASE MADE ON THIS PAGE TAKES THE STORE'S ID (spark studio-to-release): the create act takes only the takes, so
// the store names the release and the page's id is swapped for it when the answer lands (./sessionModel.ts `created`).
// The walk treats that swap as the same, still fresh release - it stays where it was, not at the first blocked step -
// and the address names the stored id, so a reload lands on it. Pure.

/** The open release went from the page's id to the store's: the walk was on `prev`, which no release holds any more,
 *  and another is open. Nothing else moves the open id while removing the old one: a refused create closes it (null),
 *  and a later read keeps the open release. */
export function isSwap(prev: string | null, next: string | null, ids: readonly string[]): boolean {
  return prev !== null && next !== null && next !== prev && !ids.includes(prev);
}

/** A release the page holds that the server's read does not: made here, so its walk starts at the first step. */
export const isPageMade = (id: string, stored: readonly { readonly release: { readonly id: string } }[]): boolean => !stored.some((r) => r.release.id === id);

/** `href` with its `r` naming `id`, everything else as it was. */
export function releaseHref(href: string, id: string): string {
  const u = new URL(href);
  u.searchParams.set("r", id);
  return u.toString();
}
