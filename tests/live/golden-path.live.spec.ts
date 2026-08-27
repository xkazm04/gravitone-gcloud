// LANE — THE LIVE APP, IN A REAL BROWSER.
//
// Registry: test-harness / live-app-harness.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS RUNG IS FOR, AND WHAT IT REFUSES TO CARRY.
//
// `tests/golden-path/` exercises this repo's modules AS THE TEST IMPORTS THEM:
// Node context, no browser, `fake-indexeddb` standing in for the storage engine.
// That rung is cheap and it is where almost everything belongs. This one runs the
// assembled product — Next's own dev server, a real Chromium, Chrome's own
// IndexedDB, hydration, the client router — and it may therefore only carry
// claims nothing cheaper can witness:
//
//   · that the app SERVES and hydrates at all, with no page error
//   · that a first-time account bootstraps its own shelf through the product's
//     seeding path, in the browser, and renders it
//   · that a project OPENS from the shelf into the studio at its own URL
//   · that work written by the studio survives a HARD RELOAD in the real
//     storage engine — the one thing fake-indexeddb explicitly cannot answer
//     (see the header of dal-real-engine.probe.spec.ts, which says so)
//   · that a background run dispatched and forgotten actually LANDS, read back
//     from the product's own job store rather than inferred from "no error"
//
// It does NOT re-verify logic the probes can see, does not enumerate inputs, and
// runs ONE representative journey per flow. Anything here that could be phrased
// as a claim about a module belongs one rung down.
//
// SEED DATA comes from the app's own bootstrapping and from nowhere else:
// `lib/useProjects.ts` hands a first-time account the demo shelf
// (app/_studio/projectSeed.ts) the moment it reads an empty store. The harness
// does not write fixtures into the database; it EMPTIES the account and lets the
// product seed itself, which is the same path a real first sign-in takes.
//
// AUTH is the repo's pre-existing dev bypass (lib/devAuth.ts): non-production
// builds only, explicit NEXT_PUBLIC_DEV_AUTH=1 opt-in, and a permanent banner so
// a bypassed session can never be mistaken for a real one. This lane asserts the
// banner before it asserts anything else — a run that reached the gated surface
// without the bypass would mean the gate was open to everyone.
// ─────────────────────────────────────────────────────────────────────────────

import { expect, test, type Page } from "@playwright/test";

import { connect, Control } from "./_control";

/** The seeded production the rest of app/_studio actually describes. Addressed
 *  by its stable id, never by list position: `projectSeed.ts` is free to grow a
 *  sixth row and `.first()` would then silently test a different project. */
const PROJECT = "seed-glass-harbor";
const PROJECT_TITLE = "Glass Harbor";

/** Every page error seen during a test, asserted at the end of each one. A React
 *  error boundary can swallow a throw and still render something plausible, so
 *  "the assertions passed" is not the same as "the page is healthy". */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/**
 * Land on the shelf with the account emptied, and let the product re-seed it.
 *
 * State reset between tests is how independence is bought in a lane that cannot
 * be parallel (see playwright.config.ts for why this product is a singleton).
 * The reset runs through the control surface, which delegates to the product's
 * own `evictIdentity` — so the teardown cannot drift from what signing out does.
 */
async function freshShelf(page: Page): Promise<Control> {
  await page.goto("/projects", { waitUntil: "domcontentloaded" });
  const control = await connect(page);
  // Wait for the gate to resolve before resetting: a reset with a null uid has
  // no account to empty and would report `failed`, which the assertion catches
  // rather than silently proceeding against a half-seeded shelf.
  await control.until((s) => s.uid !== null, "the auth gate resolves");
  const wiped = await control.reset();
  expect(wiped.failed, "the control surface could not empty the account").toBe(false);

  // A hard reload is what makes the product re-run its own bootstrapping.
  await page.reload({ waitUntil: "domcontentloaded" });
  const reconnected = await connect(page);
  await reconnected.until((s) => s.projects.length > 0, "the shelf seeds itself");
  return reconnected;
}

test.describe("the assembled studio", () => {
  test("a first-time account bootstraps its own shelf and renders it", async ({ page }) => {
    const errors = watchErrors(page);
    const control = await freshShelf(page);

    // THE BYPASS IS LOUD. If this is ever absent while the gated surface is
    // reachable, the gate is open to everyone and nothing below matters.
    await expect(page.getByTestId("dev-auth-banner")).toBeVisible();

    const snapshot = await control.snapshot();
    expect(snapshot.uid, "the bypass account signs in").toBe("dev-automation-user");
    expect(snapshot.projects.length, "the demo shelf is seeded").toBeGreaterThan(0);

    // THE PRODUCT'S OWN STATE AND WHAT IT DREW MUST AGREE. Asserting only the
    // DOM would pass on a shelf rendered from stale React state; asserting only
    // the snapshot would pass on a store that renders nothing. The disagreement
    // is the finding.
    for (const row of snapshot.projects) {
      await expect(
        page.getByTestId(`cell-${row.id}-research`),
        `the shelf renders a row for ${row.id}`,
      ).toBeVisible();
    }

    expect(errors, "page errors during the shelf journey").toEqual([]);
  });

  test("a project opens from the shelf into the studio at its own URL", async ({ page }) => {
    const errors = watchErrors(page);
    await freshShelf(page);

    // Product-level, not pixel-level: click the cell a user clicks.
    await page.getByTestId(`cell-${PROJECT}-research`).click();

    // The project is the RESOURCE and holds the path; the step is a VIEW and
    // holds the query. Both halves are the contract app/studio/[projectId] was
    // moved to, and a regression on either breaks every shared link.
    await page.waitForURL(/\/studio\/[^?]+\?step=research/);
    expect(new URL(page.url()).pathname).toBe(`/studio/${PROJECT}`);

    const headline = page.getByTestId("studio-headline");
    await expect(headline).toHaveAttribute("data-door", "open");
    await expect(headline).toHaveText(PROJECT_TITLE);

    // The rail resolves to the deep-linked step rather than the project's parked
    // one — the whole reason `?step=` exists.
    await expect(page.getByTestId("step-research")).toHaveAttribute("aria-current", "step");

    expect(errors, "page errors while opening the studio").toEqual([]);
  });

  test("a notebook written in the studio survives a hard reload of the browser", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const control = await freshShelf(page);

    // Nothing is on disk for this project yet — the shelf row exists, its body
    // of work does not. Asserting the BEFORE state is what stops this test from
    // passing on a database that was never emptied.
    const before = await control.project(PROJECT);
    expect(before.found, "the seeded project is on the shelf").toBe(true);
    expect(before.steps, "a freshly seeded project has written nothing").toBe(0);

    await page.getByTestId(`cell-${PROJECT}-research`).click();
    await page.waitForURL(/\/studio\//);

    // `load saved run` is the product's own way to land the finished notebook
    // without walking the simulated run — the same data, only the waiting
    // skipped (see LOAD_NOTE in useResearchRun.ts).
    await page.getByTestId("load-saved-run").click();
    await expect(page.getByTestId("load-saved-note")).toBeVisible();

    // The step save is fire-and-forget from the click's point of view, so this
    // polls the store rather than sleeping on a guess.
    //
    // It polls for the PHASE, not for a record count. Measured while proving
    // this test can go red: with the research write disabled the project still
    // reported one persisted record — `research-scope`, written by the scope
    // hook on the same surface — so `steps > 0` was green against a notebook
    // that was never saved. The phase is the claim; the count is a side effect.
    await expect
      .poll(async () => (await control.project(PROJECT)).phases, {
        message: "the research step never persisted its notebook",
      })
      .toContain("research");
    const after = await control.project(PROJECT);
    expect(after.steps, "and the store agrees it holds records").toBeGreaterThan(0);

    // ── THE CLAIM ONLY THIS RUNG CAN MAKE ──────────────────────────────────
    // A HARD reload: the React tree is destroyed, every in-memory store with
    // it, and the notebook has to come back out of Chrome's own IndexedDB. The
    // Node probes run against fake-indexeddb and say in their own header that
    // Chrome's storage is out of their reach.
    await page.reload({ waitUntil: "domcontentloaded" });
    const reconnected = await connect(page);

    await expect(page.getByTestId("studio-headline")).toHaveAttribute("data-door", "open");
    const survived = await reconnected.project(PROJECT);
    expect(survived.steps, "the notebook survived a hard reload").toBe(after.steps);
    expect(survived.phases).toContain("research");

    // And the surface reads it back, not just the store: the board is unlocked,
    // which it is not for a project with no notebook.
    await expect(page.getByTestId("tab-board")).toBeEnabled();

    expect(errors, "page errors across the reload").toEqual([]);
  });

  test("a background run dispatched and forgotten actually lands", async ({ page }) => {
    const errors = watchErrors(page);
    const control = await freshShelf(page);

    await page.getByTestId(`cell-${PROJECT}-research`).click();
    await page.waitForURL(/\/studio\//);

    await page.getByTestId("run-research").click();
    await expect(page.getByTestId("running-note")).toBeVisible();

    // Navigate away through the CLIENT router, the way a user does. The job
    // store lives above the route, so the work must not die with the step.
    await page.getByRole("link", { name: /projects/i }).first().click();
    await page.waitForURL(/\/projects$/);

    // READBACK WITH A DEADLINE, not "no error means it worked". The run reports
    // through the product's own job store; `until` distinguishes "reached the
    // state", "ran and never reached it" (the deadline, with the last snapshot
    // attached) and "the surface stopped answering" (a harness failure).
    const running = await control.until(
      (s) => s.jobs.running >= 1,
      "the research job is running after navigating away",
    );
    expect(running.jobs.total).toBeGreaterThan(0);

    // The mocked run is a local clock at SPEED× (useResearchRun.ts) — no network,
    // no vendor, nothing outside this process decides when it lands.
    // 45s against a run that settles in about seven. Generous enough that a slow
    // CI runner is not a finding, short enough that the deadline lands INSIDE
    // this lane's own test timeout — measured: at 90s the injected
    // never-settling run blew the test timeout first, and the readback's
    // message (which carries the last snapshot) arrived after the browser had
    // already been torn down.
    const landed = await control.until(
      (s) => s.jobs.running === 0,
      "the research job settles",
      45_000,
    );
    expect(landed.jobs.total, "the finished run is still in the tray").toBeGreaterThan(0);

    // The tray is where a user finds it, so the tray is where it is asserted.
    await page.getByTestId("bell").click();
    await expect(page.getByTestId("bell-panel")).toContainText(/returned|failed|no tension/i);

    expect(errors, "page errors during the background run").toEqual([]);
  });
  // ── FOCUS SURVIVES A DESTRUCTIVE KEYPRESS ────────────────────────────────
  //
  // Belongs on this rung and could not sit one below it: the claim is about
  // where the browser's focus lands after React unmounts the focused node, and
  // tests/golden-path/ runs in Node with no DOM and no focus at all.
  //
  // The rule is the repo's own, stated in app/library/ContextMenu.tsx: leaving
  // focus on <body> "strands a keyboard user at the top of the document". The
  // asset tile's Delete path broke it - the tile a keyboard user just removed IS
  // the focused node, so focus fell to <body> with no way back into the grid.
  test("removing a focused asset moves focus on, never to the document body", async ({ page }) => {
    const errors = watchErrors(page);
    await freshShelf(page);
    await page.goto("/library", { waitUntil: "domcontentloaded" });
    // /library opens on Styles; the tiles live in the Assets module. Reached the
    // way a user reaches it, so the journey breaks if the tab does.
    await page.getByRole("button", { name: "Assets", exact: true }).click();

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
