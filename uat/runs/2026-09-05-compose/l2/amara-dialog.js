const CHARACTER = "amara-dialog";
// The buyer's second look: the expert quick-create dialog on an account whose
// only locked themes are the wizard-minted (untagged) ones.
await goto("/projects");
await waitFor({ role: "button", name: /quick create/ }, { ms: 90000 });
await click({ role: "button", name: /quick create/ });
await sleep(600);
// the radio input is visually hidden; the label is the click target
await page.getByText("Any video", { exact: true }).first().click();
await sleep(400);
await snap("expert-dialog-any-video");
const dlg = await bodyText();
const untaggedOffered = /Signal Ledger|Newsprint|Data Neon|Chalk|Paper Relief|Blueprint/i.test(dlg);
expect("dialog offers the wizard-minted untagged themes for Any video", untaggedOffered);
const emptyCopy = /No locked style fits/.test(dlg);
expect("if the shelf is empty the copy routes to the wizard", !emptyCopy || /\/projects\/new/.test(dlg), { detail: emptyCopy ? "empty-shelf copy shown" : "themes present, empty copy not shown" });
const block = (dlg.split("VISUAL STYLE")[1] || "").split(/\n\s*\n/)[0];
const names = block.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const dupes = names.length - new Set(names).size;
expect("the style shelf has no duplicate names from minting a theme per create (observe)", dupes === 0, { detail: `${names.length} pills, ${dupes} duplicate names` });
await page.keyboard.press("Escape");
