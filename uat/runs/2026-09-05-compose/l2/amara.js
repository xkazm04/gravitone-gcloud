const CHARACTER = "amara";
// the buyer checks the expert dialog first: does the empty style shelf route somewhere?
await goto("/projects");
await waitFor({ role: "button", name: /quick create/ }, { ms: 90000 });
await click({ role: "button", name: /quick create/ });
await sleep(500);
await click({ role: "button", name: /Any video/ }).catch(() => {});
await sleep(300);
const dlg = await bodyText();
expect("expert dialog's empty style copy routes to the wizard", /\/projects\/new/.test(dlg), { detail: (dlg.match(/No locked style fits[^\n]*/) || [""])[0].slice(0, 120) });
await page.keyboard.press("Escape");
await sleep(300);
const id = await createProject({ discipline: "free", template: "free-form", preset: "signal-ledger", title: "Glow Serum launch — 45s", logline: "One drop. Eight hours. The promise is the product.", targetS: 45 });
await openStep(id, "research");
await waitFor("mode-beats", { ms: 60000 });
await click("mode-beats");
await sleep(600);
await composeSpine(SPINE_A);
await openStep(id, "script");
await waitFor("trailer-script", { ms: 30000 });
expect("withholding budget is labelled a stand-in on Script", /withholding budget are the Glass Harbor stand-in/i.test(await textOf("trailer-fixture-note")));
// add a promise, leave the payer blank → incomplete, not accepted
const beatsSel = await count("promise-add-beat");
if (beatsSel > 0) {
  await page.getByTestId("promise-add-beat").selectOption({ index: 1 }).catch(() => {});
  await fill("promise-add-sentence", "the serum will do in one night what the ritual took a month to do");
  await page.getByTestId("promise-add-sentence").press("Enter").catch(() => {});
  await sleep(500);
  const ledger = await textOf("promise-ledger");
  expect("a promise with no payer reads incomplete", /incomplete|no payer/i.test(ledger), { detail: ledger.replace(/\s+/g, " ").slice(0, 160) });
}
await snap("amara-ledger");
const cells = await shelfCells(id);
expect("Monday's shelf shows research locked", /locked/i.test(cells.research || ""), { detail: cells.research });
expect("Monday's shelf shows script in progress", /in progress/i.test(cells.script || ""), { detail: cells.script });
await snap("amara-shelf");
