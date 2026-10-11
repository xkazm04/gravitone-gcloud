// EVERY PLACE THE SUNO DRIVER TOUCHES SUNO'S PAGE OR API — server-only, one table.
//
// When Suno ships a redesign, this is the file that breaks and the only file
// that should need editing. Each entry names what it targets and the date it
// was read off the live page (recon 2026-10-11, signed-in Pro account, Chrome
// 154, suno.com/create in "Advanced" mode). docs/suno-driver.md says how to
// re-run the recon.
//
// Two facts that shaped the selectors and are easy to lose:
//   · The Simple AND the Advanced form are both mounted at once; the hidden one
//     is not `hidden` or aria-hidden, it is just not laid out. Every form
//     selector is therefore used through `.filter({ visible: true })`.
//   · The style textarea's placeholder is a random suggestion list that changes
//     on every load, so it can never be a selector.

export const SELECTORS = {
  page: {
    /** 2026-10-11 — the custom-create page. */
    createUrl: "https://suno.com/create",
    /** 2026-10-11 — a signed-out visit lands on a URL containing this. */
    signInPath: "/sign-in",
  },
  form: {
    /** 2026-10-11 — the Simple/Advanced switch; tabs are <button role=tab>. Advanced is the custom form. */
    advancedTab: "button[role=tab]:text-is('Advanced')",
    /** 2026-10-11 — song title; one per mode, the visible one sits under More Options. */
    title: "input[placeholder='Song Title (Optional)']",
    /** 2026-10-11 — lyrics, a contenteditable. Empty lyrics = instrumental (no separate switch exists). */
    lyrics: "[role=textbox][aria-label='Lyrics editor']",
    /** 2026-10-11 — the style prompt: the only textarea without an aria-label in Advanced mode
     *  (the Cowriter textarea is aria-labelled; Simple's "Describe the sound you want" is hidden). */
    style: "textarea:not([aria-label]):not([placeholder='Describe the sound you want'])",
    /** 2026-10-11 — exclude styles, inside More Options but laid out without expanding it. */
    exclude: "input[placeholder='Exclude styles']",
    /** 2026-10-11 — the Create button; disabled until the form has content. */
    create: "button[aria-label='Create song']",
  },
  model: {
    /** 2026-10-11 — the picker trigger: a pill whose text is the current model ("v6"), opens a dialog. */
    trigger: "button[aria-haspopup=dialog]",
    /** 2026-10-11 — the trigger's text shape, used to tell it from the other dialog buttons. */
    triggerText: /^v\d[\w.-]*$/i,
    /** 2026-10-11 — one row per model under "ALL MODELS"; the first line of its text is the label
     *  ("v6", "v6-wild", "v6-mini"), `aria-selected` marks the current one. */
    row: "[role=dialog] [role=grid] [role=row]",
  },
  api: {
    /** 2026-10-11 — the API host the page calls with a Clerk bearer. */
    base: "https://studio-api-prod.suno.com",
    /** 2026-10-11 — the create request (read from the page's JS bundle; answered with {clips:[...]}). */
    generate: /\/api\/generate\/v2-web\/?(\?|$)/,
    /** 2026-10-11 — one clip by id; answers 200 with the clip JSON. */
    clip: (id: string) => `/api/clip/${encodeURIComponent(id)}`,
    /** 2026-10-11 — credits: {credits, monthly_usage, monthly_limit}. */
    billing: /\/api\/billing\/info\/?(\?|$)/,
    /** 2026-10-11 — a complete clip's audio_url is this sentinel; the real file is in media_urls. */
    forbiddenAudio: /\/api\/forbidden\/?$/,
  },
  auth: {
    /** 2026-10-11 — Clerk's "client updated at" cookie (name may carry a suffix like
     *  `__client_uat_Jnxw-muT`); a positive epoch means a signed-in client, "0" means signed out. */
    clientUatPrefix: "__client_uat",
    /** 2026-10-11 — the cookie origin to read them from. */
    cookieUrl: "https://suno.com",
  },
} as const;

/** "v6 wild", "v6-wild", "V6-WILD" are one label: lowercase, whitespace and
 *  hyphen runs folded to a single hyphen. The live picker says "v6-wild";
 *  SUNO_MODEL_LABEL may spell it with a space. */
export function normalizeModelLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[\s-]+/g, "-");
}
