const CHARACTER = "kwame";
// first-timer: meets the wizard cold and must know what to press
await goto("/projects/new");
await waitFor("deck-card-educational", { ms: 90000 });
// REWRITTEN 2026-09-08 — the design this checked was deliberately removed.
// Kwame's need is unchanged: a first-timer must not be stranded on arrival.
// What changed is how the wizard answers it. It used to show a permanently
// disabled Next beside the words "pick a card to continue" — a dead control
// plus a sentence explaining why it was dead. The pick stages now declare
// `advance: "pick"` (Deck.tsx), so the cards ARE the forward control and no
// Next is rendered at all. There is nothing to explain because there is
// nothing blocked.
//
// So the check inverts: the pass condition is now the ABSENCE of the dead
// control, plus a real card to press. The old report (kwame--compose-from-
// scratch.md, findings.json) is left exactly as it was — it records what was
// true on 2026-09-05. This file is an executable probe that recertify re-runs,
// not the record.
expect("a pick stage offers no dead control — the card IS the control",
  !(await has("deck-blocked-hint")) && (await has("deck-card-educational")));
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
