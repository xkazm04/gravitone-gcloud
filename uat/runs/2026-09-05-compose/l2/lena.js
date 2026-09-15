const CHARACTER = "lena";
// runtime ownership: type 40 over the template's 30, go back, re-pick, the 40 must hold
await goto("/projects/new");
await waitFor("deck-card-educational", { ms: 90000 });
await click("deck-card-educational");
await click({ role: "button", name: /^Next$/ });
await click("deck-card-short-form-clip");
await click({ role: "button", name: /^Next$/ });
await click("deck-card-preset:data-neon");
await click({ role: "button", name: /^Next$/ });
expect("template seeded 30s", (await page.locator("#w-dur").inputValue()) === "30");
await fill({ css: "#w-dur" }, "40");
await click({ role: "button", name: /^Back$/ });
await click({ role: "button", name: /^Back$/ });
await click("deck-card-short-form-clip"); // unpick
await click("deck-card-short-form-clip"); // re-pick
await click({ role: "button", name: /^Next$/ });
// the style pick survived the template round trip (same discipline) — clicking
// the picked card again would UNPICK it, so only pick when nothing is picked
const stillPicked = await page.locator('[data-testid="deck-card-preset:data-neon"] [aria-pressed="true"]').count();
if (stillPicked === 0) await click("deck-card-preset:data-neon");
await click({ role: "button", name: /^Next$/ });
expect("owned runtime survives re-picking the template", (await page.locator("#w-dur").inputValue()) === "40", { detail: await page.locator("#w-dur").inputValue() });
// 0s is refused
await fill({ css: "#w-title" }, "One number about rent");
await fill({ css: "#w-dur" }, "0");
await sleep(200);
expect("a 0 s runtime disables Create & open and says why", await disabled({ role: "button", name: /Create & open/ }) && /runtime above 0/i.test(await textOf("deck-blocked-hint").catch(() => "")));
await fill({ css: "#w-dur" }, "40");
await click({ role: "button", name: /^Create & open$/ }, { ms: 30000 });
await waitUntil(async () => /\/studio\/p-/.test(url()), { label: "studio opens", ms: 60000 });
const id = url().match(/\/studio\/([^/?#]+)/)[1];
await waitUntil(async () => (await attr("studio-headline", "data-door")) === "open", { label: "door", ms: 60000 });
expect("header pill shows 40s", /40s/i.test(await bodyText()));
record({ id, title: "One number about rent", discipline: "educational", template: "short-form-clip", preset: "data-neon", targetS: 40, character: CHARACTER });
await openStep(id, "research");
await runResearch("Why rent rises faster than wages");
await walkGuidedToScript(id, { confirm: true });
expect("runtime mismatch stated (40s vs fixture)", await has("script-runtime-note"), { detail: await textOf("script-runtime-note").catch(() => "absent") });
await click("duel-more-derived-short");
await sleep(300);
const depth = await textOf("duel-depth-derived-short");
expect("derived short shows seconds at a stated wpm", /0:45 at \d+ wpm/.test(depth), { detail: (depth.match(/0:45[^\n]*/) || [""])[0] });
expect("guided face says what the short is derived from (LE-L1-2, expect absent)", /derived from/i.test(depth));
await snap("lena-derived-depth");
await click("deck-card-derived-short");
await sleep(300);
expect("adopted", await has("duel-adopted-derived-short"));
