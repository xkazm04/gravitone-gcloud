const CHARACTER = "priyanka";
const id = await createProject({ discipline: "educational", template: "short-educational-video", preset: "blueprint", title: "Module 7 — phishing in two minutes", targetS: 120 });
await openStep(id, "research");
await runResearch("How phishing emails get past a careful reader");
await walkGuidedToScript(id, { takeHottest: false, confirm: true });
// back to Research, switch to the expert board, cut a fact, see drift
await openStep(id, "research");
await sleep(500);
// DA-L1-11: a decided project reopens on the EXPERT face by default (computed, never stored)
const reopenedOnExpert = await has("tab-board");
expect("return visit reopens on the expert face (DA-L1-11 — observe)", reopenedOnExpert);
if (!reopenedOnExpert) { await click("research-face-switch"); await sleep(500); }
expect("expert board mounted", await has("tab-board"));
await click("tab-board");
await sleep(500);
await click("scope-toggle-f-ath");
await sleep(400);
expect("drift is reported after a cut past the checkpoint", await has("scope-diverged"), { detail: await textOf("scope-diverged").catch(() => "absent") });
await snap("priyanka-drift");
const progDrift = await progressOf(id);
expect("research progress reads 'review' (needs a call) on drift", progDrift?.research === "review", { detail: JSON.stringify(progDrift) });
await click("confirm-scope");
await sleep(400);
// Script Coverage: the cut card stays cut
await openStep(id, "script");
await waitFor("view-coverage", { ms: 30000 });
await click("view-coverage");
await sleep(600);
const cellUsage = await attr("cell-reversal-chain-f-ath", "data-usage").catch(() => null);
const cellText = await textOf("cell-reversal-chain-f-ath").catch(() => "");
expect("a cut card is drawn cut in Coverage (PR-L1-2: observe seconds still shown)", cellUsage !== null, { detail: `usage=${cellUsage} text=${cellText}` });
expect("evidence log reachable from Script (PR-L1-3, expect absent)", await has("open-evidence"));
await snap("priyanka-coverage");
