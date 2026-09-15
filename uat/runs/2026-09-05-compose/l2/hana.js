const CHARACTER = "hana";
const id = await createProject({ discipline: "educational", template: "mid-educational-video", preset: "paper-relief", title: "Why is the sky blue at noon and red at night", targetS: 240 });
await openStep(id, "research");
await runResearch("Why is the sky blue at noon and red at night");
// leave the hottest take OUT; confirm
await walkGuidedToScript(id, { takeHottest: false, confirm: true });
expect("240s mismatch stated on Script", /240s/.test(await textOf("script-runtime-note").catch(() => "")), { detail: await textOf("script-runtime-note").catch(() => "absent") });
// Coverage: the not-taken conclusion row
await click("view-coverage");
await sleep(600);
const pipTitle = await attr({ css: '[data-testid="row-c-reserve-was-the-product"] [title]' }, "title").catch(() => null);
const cov = await bodyText();
expect("Coverage reflects the hottest take as not taken / out of scope", /not taken|out of scope/i.test(String(pipTitle) + cov), { detail: String(pipTitle) });
await snap("hana-coverage");
await click("view-candidates");
await sleep(400);
await click("duel-more-adjudication");
await sleep(300);
await click("duel-beats-adjudication");
await sleep(500);
expect("beat text readable before adoption", /beats ·/i.test(await bodyText()));
await page.keyboard.press("Escape");
await click("deck-card-adjudication");
await sleep(300);
expect("adopted", await has("duel-adopted-adjudication"));
const cells = await shelfCells(id);
expect("shelf research moved", !/not started/i.test(cells.research || ""), { detail: cells.research });
