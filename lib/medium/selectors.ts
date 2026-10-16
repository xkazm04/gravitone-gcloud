// EVERY PLACE THE MEDIUM DRIVER TOUCHES MEDIUM'S PAGE — server-only, one table.
//
// When Medium ships an editor redesign this is the file that breaks and the only
// one that should need editing. Each entry names what it targets and the date it
// was read off the live page (recon 2026-10-16, signed-in account, Chrome 154,
// medium.com/new-story). docs/medium-driver.md says how to re-run the recon.
//
// There is NO entry for publishing, scheduling or submitting for review, and
// there must never be one: the driver makes a private draft and stops. The
// `forbidden` pattern below is the request guard that backs that up.

export const SELECTORS = {
  page: {
    /** 2026-10-16 — the editor for a new story; the draft exists after the first edit. */
    newStoryUrl: "https://medium.com/new-story",
    /** 2026-10-16 — a signed-out visit to the editor lands on a URL containing one of these. */
    signedOut: /\/m\/signin|\/signin|\/m\/global-identity|\/m\/connect/,
    /** 2026-10-16 — a saved draft's address; the id is hex. */
    draftUrl: /^https:\/\/medium\.com\/p\/[0-9a-f]+\/edit/,
  },
  editor: {
    /** 2026-10-16 — the one contenteditable that holds the title and the body (classic editor). */
    body: "div.postArticle-content.js-postField[contenteditable=true]",
    /** 2026-10-16 — the title paragraph the first pasted h1 becomes. */
    title: "h3.graf--title",
    /** 2026-10-16 — an uploaded figure; the caption is its own contenteditable. */
    figureImage: "figure.graf--figure img.graf-image",
    caption: "figure.graf--figure figcaption.imageCaption",
  },
  api: {
    /** 2026-10-16 — the autosave: POST /p/<id>/deltas. */
    save: /\/p\/[0-9a-f]+\/deltas/,
    /** 2026-10-16 — every request the driver aborts: publishing and scheduling. */
    forbidden: /\/publish|\/schedule|\/submit/i,
  },
  auth: {
    cookieUrl: "https://medium.com",
    /** 2026-10-16 — present while signed in (alongside `uid`). */
    sessionCookie: "sid",
  },
  /** A figure's place in the pasted HTML until the PNG is pasted over it. */
  marker: (n: number) => `⟦FIGURE ${n}⟧`,
  markerPrefix: "⟦FIGURE",
} as const;
