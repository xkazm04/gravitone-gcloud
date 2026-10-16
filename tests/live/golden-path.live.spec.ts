// LANE — THE LIVE APP, IN A REAL BROWSER.
//
// Registry: test-harness / live-app-harness.
//
// This rung runs the assembled product - Next's own dev server, a real Chromium, Chrome's own
// IndexedDB, hydration, the client router - and carries only claims nothing cheaper can witness.
//
// PHASE 4 WAVE D (L43): THE v1 JOURNEYS RETIRED WITH THE SURFACES THEY WALKED. Six of this file's
// seven journeys walked the v1 shelf (/projects, seeded by lib/useProjects.ts) into the studio
// (/studio/<id>); both retired and redirect to the Project. Where each guarantee went:
//   · the app serves and hydrates with no page error   -> studio-routes.live.spec.ts (every
//     (studio) route, page errors asserted) and kit.live.spec.ts
//   · a first-time account bootstraps its own shelf     -> none: nothing seeds browser projects
//     now; /projects is the server's composition list (produce.live.spec.ts composes into it)
//   · a project opens at its own URL                   -> produce.live.spec.ts (compose lands on
//     /projects/<id>) and import.live.spec.ts (an imported project opens as its Plan)
//   · studio work survives a hard reload               -> none at this rung: part records live
//     in the kernel store (tests/next-server/parts-real.test.ts reads them back across a fresh
//     store handle); the browser holds no step record to lose
//   · a dispatched background run lands                -> produce-real.live.spec.ts (the worker
//     drives the launched job to done) and exit-same-job.live.spec.ts (L44)
//   · a dialog whose opener was removed; deleting a project hands focus to the landmark -> none:
//     the Research step's Clear dialog and the shelf's Delete retired; components/ui/Modal.tsx's
//     restore rule is unchanged but has no journey at this rung until a new surface removes an
//     opener under a dialog
// The journey that stays is /library's, which is not retired (Phase 5).
//
// AUTH is the repo's dev bypass (lib/devAuth.ts): non-production builds only, explicit
// NEXT_PUBLIC_DEV_AUTH=1 opt-in, and a permanent banner.

import { expect, test, type Page } from "@playwright/test";

import { connect } from "./_control";

/** Every page error seen during a test, asserted at the end of each one. A React
 *  error boundary can swallow a throw and still render something plausible, so
 *  "the assertions passed" is not the same as "the page is healthy". */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/**
 * Land on /library with the account emptied, and let the product re-seed its shelf. The reset
 * runs through the control surface, which delegates to the product's own `evictIdentity`, so the
 * teardown cannot drift from what signing out does. (It used to land on the v1 /projects shelf,
 * which seeded the account's projects; the shelf retired, and the library seeds its own assets.)
 */
async function freshAccount(page: Page): Promise<void> {
  await page.goto("/library", { waitUntil: "domcontentloaded" });
  const control = await connect(page);
  await control.until((s) => s.uid !== null, "the auth gate resolves");
  const wiped = await control.reset();
  expect(wiped.failed, "the control surface could not empty the account").toBe(false);
  await page.reload({ waitUntil: "domcontentloaded" });
  await (await connect(page)).until((s) => s.uid !== null, "the auth gate resolves again");
}

test.describe("the assembled app", () => {
  test("removing a focused asset moves focus on, never to the document body", async ({ page }) => {
    const errors = watchErrors(page);
    await freshAccount(page);
    // /library opens on Styles; the tiles live in the Assets module. Reached the
    // way a user reaches it, so the journey breaks if the tab does.
    // `role="tab"`, and the name carries the count — the module rail became a
    // real tablist (components/ui/signal/TabRail) when /library stopped
    // explaining itself in a paragraph per tab. `exact: "Assets"` matched the
    // old <button>; the accessible name is now "Assets 30". Anchored prefix,
    // so a changing count cannot break the journey again.
    await page.getByRole("tab", { name: /^Assets/ }).click();

    // The shelf seeds from the trial index through the product's own path.
    const tiles = page.locator("figure[data-asset-id]");
    await expect(tiles.first()).toBeVisible({ timeout: 20_000 });
    const before = await tiles.count();
    expect(before, "the library needs at least two tiles for this claim").toBeGreaterThan(1);

    const doomedId = await tiles.first().getAttribute("data-asset-id");
    await tiles.first().focus();
    await expect(tiles.first()).toBeFocused();

    await page.keyboard.press("Delete");

    await expect(tiles).toHaveCount(before - 1);
    const landedOn = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { tag: el?.tagName ?? null, assetId: el?.dataset?.assetId ?? null };
    });
    // THE FINDING IS THE BODY. Naming it explicitly rather than asserting a
    // positive only: a future regression lands here, and "focus is on BODY" is
    // the sentence that explains itself.
    expect(landedOn.tag, "focus was stranded on the document body").not.toBe("BODY");
    expect(landedOn.assetId, "focus stayed on the tile that was removed").not.toBe(doomedId);

    // Backspace is NOT a removal key - it is the browser's back key by muscle
    // memory, and a shelf entry cannot be restored once removed.
    const survivor = tiles.first();
    await survivor.focus();
    const after = await tiles.count();
    await page.keyboard.press("Backspace");
    await expect(tiles).toHaveCount(after);

    expect(errors, "page errors during the library journey").toEqual([]);
  });
});
