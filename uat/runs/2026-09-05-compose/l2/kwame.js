const CHARACTER = "kwame";
// first-timer: reads the blocked hint on Next before picking anything
await goto("/projects/new");
await waitFor("deck-card-educational", { ms: 90000 });
expect("a disabled Next says what unlocks it", /pick a card to continue/i.test(await textOf("deck-blocked-hint").catch(() => "")));
const id = await createProject({ discipline: "educational", template: "short-educational-video", preset: "newsprint-cutout", title: "Suez in two minutes", targetS: 120 });
await openStep(id, "research");
await runResearch("How the Suez crisis actually ended");
await walkGuidedToScript(id, { takeHottest: false, confirm: true });
expect("candidates shown", await has("candidates-duel"));
expect("the 120s vs fixture mismatch is STATED on Script", await has("script-runtime-note"), { detail: await textOf("script-runtime-note").catch(() => "absent") });
const t = await textOf("script-runtime-note").catch(() => "");
expect("the note names his template and runtime", /Short educational · 120s/.test(t), { detail: t });
await snap("script-runtime-note");
// the disabled Recalibrate in the pad: does it say why? (KW-L1-6, observe)
const rec = await attr("run-recalibration", "title").catch(() => null);
expect("disabled Recalibrate carries a reason (observe)", !!rec, { detail: String(rec) });
await click("deck-card-derived-short");
await sleep(400);
expect("adopted the short candidate", await has("duel-adopted-derived-short"));
const cells = await shelfCells(id);
expect("shelf research cell moved", !/not started/i.test(cells.research || ""), { detail: cells.research });
expect("shelf script cell moved", !/not started/i.test(cells.script || ""), { detail: cells.script });
