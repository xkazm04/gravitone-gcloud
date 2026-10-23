// EVERY PLACE THE LEONARDO STUDIO DRIVER TOUCHES LEONARDO'S PAGE OR API —
// server-only, one table, the shape lib/suno/selectors.ts set.
//
// When Leonardo ships a redesign this is the file that breaks and the only file
// that should need editing.
//
// TWO GRADES OF ENTRY, AND THE DIFFERENCE IS THE POINT. Each entry is dated and
// says where it came from:
//   · "2026-10-11 run" — read off the studio's own traffic during the measured
//     run recorded in the ai-registry technique studio-pool-fallback (fcf2e7cc,
//     application process--studio-pool-fallback.md). Operation names, the
//     credit units, the CDP port and profile.
//   · "UNVERIFIED 2026-10-12" — written when the profile was NOT running and the
//     page's bundle sits behind a Vercel checkpoint that a plain fetch cannot
//     pass, so no DOM was read. These are the studio's visible labels as the
//     run's notes describe them, spelled as selectors. `studioRecon()`
//     (driver.ts) resolves every one of them against the live page without
//     spending — run it once and correct this table before the first live
//     generation.
//
// Two facts that shaped the driver and are easy to lose:
//   · The identity of the new generation comes from the NETWORK (the page's own
//     `Generate` answer carries `generationId`), never from "the first card":
//     a cleanup that trusted the first card aimed a delete at the operator's
//     older poster three times on 2026-10-11.
//   · An image of the generation is recognised by its CDN path, which carries
//     the generation id: `/generations/<generationId>/`. That is the same shape
//     the REST API returns, so it does not depend on any GraphQL field name.

const MODEL_ID = "openai/gpt-image-2.5-sunburst";

export const STUDIO = {
  /** 2026-10-12 recon — the model the stills are made with (operator,
   *  2026-10-12: GPT Image 2.5 Sunburst at High, 1376x768, style Dynamic - the
   *  studio's default style, id 111dc692-d470-4eec-b791-3475abac4c46). `id` is
   *  the studio's own model key (its request schema's `model` const); `label`
   *  is what the model control reads once the URL has set it. */
  model: { id: MODEL_ID, label: "GPT Image 2.5 Sunburst" },
  page: {
    /** 2026-10-11 run — the launch URL the profile was opened on. */
    generateUrl: "https://app.leonardo.ai/generate",
    /** 2026-10-12 recon — the image form, set entirely by the URL. The bare
     *  generate page reopens the LAST model used (the recon found the profile
     *  on hailuo-03 video, "Generate 90"), so the model, the aspect, one image,
     *  the size, the quality and prompt enhancement are all named here rather
     *  than clicked; a size or quality a hand last picked STICKS to the session
     *  otherwise. Sunburst at 16:9 x1 reads (7 credits per megapixel times the
     *  quality factor): size=SMALL 1376x768 quality=HIGH "Generate 71",
     *  quality=MEDIUM 20, size=MEDIUM 2048x1136 at HIGH 155. promptEnhance=OFF:
     *  the studio's Auto rewrites short prompts, which could add the lettering
     *  the treatment forbids. (Lucid Origin, the first model: model=lucid-origin
     *  at SMALL read "Generate 8".) MEDIUM since 2026-10-23 (operator: "use
     *  'Medium' quality setting instead of 'High', it will be good enough"): 20
     *  credits an image instead of 71. */
    imageUrl: (aspect: string) =>
      `https://app.leonardo.ai/generate?model=${encodeURIComponent(MODEL_ID)}&aspectRatio=${encodeURIComponent(aspect)}&quantity=1&size=SMALL&quality=MEDIUM&promptEnhance=OFF`,
    /** UNVERIFIED 2026-10-12 — a signed-out visit is redirected to an auth page. */
    signedOutPath: /\/(auth|login|sign-?in)\b/i,
  },
  api: {
    /** 2026-10-11 run — every studio operation goes through this one endpoint. */
    graphql: "https://api.leonardo.ai/v1/graphql",
    /** 2026-10-11 run — the spend. Answers {generationId, cost:{amount, unit:"CREDITS"}}. */
    generateOp: /^Generate$/,
    /** 2026-10-11 run — the balance: subscriptionTokens + rolloverTokens. */
    tokensOp: /^GetTokens$/,
    /** 2026-10-11 run — the keys of GetTokens that together are the studio pool. */
    balanceKeys: ["subscriptionTokens", "rolloverTokens", "paidTokens"],
    /** 2026-10-11 run — DeleteGeneration {id}, DeleteInitImages {ids}. WP1 deletes
     *  nothing, so every operation this matches is aborted on the wire. */
    destructiveOp: /delete|remove|trash|archive/i,
    /** 2026-10-11 run — the generation's terminal statuses (the API's spelling). */
    failedStatus: /^FAILED$/i,
    refusedStatus: /^NSFW$/i,
  },
  cdn: {
    /** 2026-10-11 run (and the REST API) — an image of generation <id>. */
    imageOf: (generationId: string) =>
      new RegExp(`^https://cdn\\.leonardo\\.ai/[^\\s"']*/generations/${generationId.replace(/[^0-9a-z-]/gi, "")}/[^\\s"']+\\.(?:jpe?g|png|webp)`, "i"),
  },
  form: {
    /** 2026-10-12 recon (1 match) — the prompt box: the page's one visible textarea. */
    prompt: "textarea",
    /** 2026-10-12 recon — the model control reads "Model GPT Image 2.5 Sunburst" under imageUrl. */
    modelTrigger: "button:has-text('Model')",
    modelOk: /\bGPT Image 2\.5 Sunburst\b/i,
    /** 2026-10-12 recon — the aspect chips are radio cards: <button role=radio value="16:9">. */
    aspect: (label: string) => `[role=radio][value='${label}']`,
    /** 2026-10-12 recon — the count chips read "1".."4" on the image form. */
    countOne: "[role=radio][value='1'], button:text-is('1')",
    /** 2026-10-12 recon — the spend button; its label carries the price ("Generate
8"). */
    generate: "button:has-text('Generate')",
  },
  auth: {
    /** 2026-10-12 recon — the session is better-auth's (`__Secure-better-auth.session_token`);
     *  the Cognito names are kept for an older login. */
    cookieUrl: "https://app.leonardo.ai",
    sessionCookie: /better-auth\.session_token|session-token|CognitoIdentityServiceProvider\..*\.(idToken|refreshToken)$/i,
  },
  limits: {
    /** 2026-10-12 recon — one Sunburst image at Small/High reads "Generate 71",
     *  at Small/Medium 20 (Lucid Origin was 8). A price read off the button above
     *  this ceiling is refused before the click: High quality left in the session
     *  (71), a Medium size (155) or a video model (90) is never bought by accident. */
    maxCreditsPerImage: 25,
    /** 2026-10-11 run — 11 s for one image; three minutes is the API adapter's ceiling. */
    renderTimeoutMs: 3 * 60_000,
    /** How long the page may take to answer the click with `Generate`. */
    generateAnswerMs: 60_000,
  },
} as const;
