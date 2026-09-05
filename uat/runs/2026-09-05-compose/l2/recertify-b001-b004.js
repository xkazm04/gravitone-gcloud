const CHARACTER = "recertify-b001-b004";
// B-001 · Priyanka's project: f-ath was cut on the expert board past the checkpoint and is still spoken for 12s
await openStep("p-mtokidjw-ri3i7v", "script");
await waitFor("view-coverage", { ms: 60000 });
await click("view-coverage");
await sleep(700);
expect("row for the cut card is marked descoped", (await attr("row-f-ath", "data-scope")) === "descoped", { detail: String(await attr("row-f-ath", "data-scope")) });
expect("the conflict marker names the seconds and the render", await has("conflict-f-ath") && /cut · still spoken 12s by Reversal Chain/.test(await textOf("conflict-f-ath")), { detail: await textOf("conflict-f-ath").catch(() => "absent") });
expect("the spoken cell carries the conflict attribute", (await attr("cell-reversal-chain-f-ath", "data-conflict")) === "true");
expect("the footnote counts the disagreement", await has("matrix-scope-conflicts") && /f-ath/.test(await textOf("matrix-scope-conflicts")), { detail: await textOf("matrix-scope-conflicts").catch(() => "absent") });
// not-taken vs descoped
const notTakenTitle = await attr("scope-c-reserve-was-the-product", "title");
expect("a not-taken conclusion's pip says 'Not taken', not 'Out of scope'", /^Not taken/.test(String(notTakenTitle)), { detail: String(notTakenTitle) });
expect("the not-taken row is not tinted as a cut", (await attr("row-c-reserve-was-the-product", "data-scope")) === "not-taken");
const cutTitle = await attr("scope-f-ath", "title");
expect("a cut card's pip says 'Descoped'", /^Descoped/.test(String(cutTitle)), { detail: String(cutTitle) });
await snap("b001-coverage");
// B-004 · Lena's 40 s short-form project: the derived short's depth does the subtraction
await openStep("p-mtokgh1c-owug0u", "script");
await waitFor("view-candidates", { ms: 60000 });
await sleep(500);
if (!(await has("duel-more-derived-short"))) { await click("script-face-switch"); await sleep(500); }
await click("duel-more-derived-short");
await sleep(400);
const delta = await textOf("duel-runtime-delta-derived-short").catch(() => "");
expect("the depth prints +5 s over your 40 s at 150 wpm", /\+5 s over your 40 s at 150 wpm/.test(delta), { detail: delta });
expect("and says roughly how many words that is", /words to cut/.test(delta));
expect("the narration-led caveat is on the guided face", await has("duel-deviation-derived-short") && /narration-led/i.test(await textOf("duel-deviation-derived-short")));
await click("duel-more-reversal-chain");
await sleep(300);
const d2 = await textOf("duel-runtime-delta-reversal-chain").catch(() => "");
expect("the 5:00 render says how far over 40 s it is", /\+260 s over your 40 s/.test(d2), { detail: d2 });
await snap("b004-duel-depth");
