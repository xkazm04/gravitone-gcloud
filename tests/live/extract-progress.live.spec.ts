// LANE — THE LIVE APP, IN A REAL BROWSER.
//
// WHY THIS CLAIM IS HERE AND NOT ONE RUNG DOWN.
//
// The live lane's header refuses anything a probe could witness, and it is
// right to. This case is the exception it describes rather than a breach of it:
// the work whose progress is in question is `prepareUpload` — `createImageBitmap`
// → `canvas.drawImage` → `toDataURL` — and NONE of those three exist in
// `tests/golden-path/`'s Node context. There is no DOM, no canvas, no image
// decoder, and `fake-indexeddb` does not stand in for any of them. A source
// ratchet could assert that a counter is *written*; only a browser can witness
// that the counter actually *ticks* while eight real images are decoded and
// re-encoded one after another.
//
// WHAT IS COUNTED, and why the predicate is deliberately not "our own testid".
//
// The instrument samples the ENTIRE new-run panel's rendered text and collects
// every distinct "<i> of <N>" it ever shows between the drop and the create
// POST. It is blind to how the count is drawn — a testid, a button label, an
// aria-live region all count the same — so it cannot pass merely because the
// fix added the element the test looks for. Nothing else in that panel renders
// that shape: the sidebar spells progress "3/8", the caps read "up to 60", and
// the button says "Extract from 8 images".
//
// WHERE THE SAMPLE STOPS. The page's own `fetch` is wrapped to raise a flag the
// instant the create POST is issued, synchronously, in the page. Everything the
// panel renders after that is the run's progress, not the upload's, and is not
// what this case is about. A clock comparison across the Node/page boundary
// would have been a guess; a flag set inside the call is not.
//
// THE NETWORK IS INTERCEPTED. `/api/foundry/extract` is fulfilled by the
// harness: the collection GET as an empty shelf, the create POST as a refusal.
// This case is about the seconds BEFORE the POST, and a real create would spend
// a run's worth of model calls to tell it nothing.

import { expect, test } from "@playwright/test";

import { gallery } from "./_gallery";

/** How many images the gallery drops. Eight is more than "a handful" — the
 *  size at which the card says the silence stops being tolerable — and still
 *  a few seconds of decode. */
const N = 8;

type Probe = { texts: string[]; postSeen: boolean };

test("dropping a gallery into Extract reports its progress before the create POST", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  let posts = 0;
  await page.route("**/api/foundry/extract", async (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "blocked by the harness" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ runs: [] }) });
  });

  // THE FLAG, set inside the page's own fetch. Installed before any document
  // script runs, so the app's first request cannot outrun it.
  await page.addInitScript(() => {
    const probe: Probe = { texts: [], postSeen: false };
    (window as unknown as { __extractProbe: Probe }).__extractProbe = probe;
    const original = window.fetch;
    window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "POST" && url.includes("/api/foundry/extract")) probe.postSeen = true;
      return original.call(window, input, init);
    };
  });

  await page.goto("/foundry", { waitUntil: "domcontentloaded" });
  // The bypass is loud here as it is everywhere: a gated surface reachable
  // without it would mean the gate is open to everyone.
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();

  // BY TESTID, BOTH OF THEM, and that is not a preference — it is what the
  // signal vocabulary's conversion left standing. The tab row is now
  // <TabRail>, whose tabs are `role="tab"` and whose accessible name INCLUDES
  // the tally chip ("Extract 3"), so `getByRole("button", { name: "Extract",
  // exact: true })` matches nothing. And the dropzone's instruction sentence
  // ("Drop screenshots and images here…") was deleted: a dashed box already
  // says it, and what stays visible there is the constraint row. `testId` on
  // TabDef exists for exactly this — a shared primitive that cannot carry the
  // host's test contract is one nobody can adopt.
  await page.getByTestId("foundry-tab-extract").click();
  const drop = page.getByTestId("extract-dropzone");
  await expect(drop).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(gallery(N));
  const start = page.getByRole("button", { name: `Extract from ${N} images` });
  await expect(start).toBeEnabled();

  // THE COLLECTOR — every DOM commit, plus every painted frame. A React commit
  // between two awaits is a microtask apart from the next decode, which the
  // observer sees; the frame loop is the belt to that pair of braces.
  await page.evaluate(() => {
    const probe = (window as unknown as { __extractProbe: Probe }).__extractProbe;
    const root = document.querySelector("main");
    if (!root) throw new Error("HARNESS FAILURE: no <main> to observe on /foundry.");
    const take = () => {
      if (probe.postSeen) return;
      const text = root.innerText ?? "";
      for (const m of text.matchAll(/\b\d+\s+of\s+\d+\b/g)) if (!probe.texts.includes(m[0])) probe.texts.push(m[0]);
    };
    new MutationObserver(take).observe(root, { subtree: true, childList: true, characterData: true });
    const frame = () => {
      take();
      if (!probe.postSeen) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  await start.click();

  // The pass is only meaningful if the shrink pass actually ran to its end: a
  // zero read from a page that never reached the POST would be an accident.
  await expect.poll(() => posts, { message: "the create POST never fired" }).toBe(1);

  const signals = await page.evaluate(() => (window as unknown as { __extractProbe: Probe }).__extractProbe.texts);
  expect(
    signals,
    `distinct progress counts rendered while ${N} images were shrunk — one per image is the claim`,
  ).toHaveLength(N);
  // Not just N of them: the LAST image must be named, or the count stalled.
  expect(signals, "the count reaches the last image").toContain(`${N} of ${N}`);

  expect(errors, "page errors while starting an extraction").toEqual([]);
});
