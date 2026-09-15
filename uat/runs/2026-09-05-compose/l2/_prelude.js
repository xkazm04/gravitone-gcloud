// Shared L2 prelude — prepended to every Character script (cat _prelude.js x.js | drive-script).
// Everything here is in the Character's reachable set; assertions live in the per-Character file.

const NEXT = { role: "button", name: /^Next$/ };
const FINISH = { role: "button", name: /^Create & open$/ };

/** The wizard, end to end. Returns the new project id read off the studio URL. */
async function createProject({ discipline, template, preset, title, logline = "", targetS }) {
  await goto("/projects/new");
  await waitFor(`deck-card-${discipline}`, { ms: 90000 });
  await click(`deck-card-${discipline}`);
  await click(NEXT);
  await click(`deck-card-${template}`);
  await click(NEXT);
  await sleep(500);
  const presetCount = await count({ css: '[data-testid^="deck-card-preset"]' });
  const borrowed = /written for educational video · fits any/i.test(await bodyText());
  expect(`style stage offers presets for ${discipline}`, presetCount === 6, { detail: `presets=${presetCount} borrowed=${borrowed}` });
  await click(`deck-card-preset:${preset}`);
  await click(NEXT);
  await fill({ css: "#w-title" }, title);
  if (logline) await fill({ css: "#w-logline" }, logline);
  if (targetS !== undefined) await fill({ css: "#w-dur" }, String(targetS));
  await snap("wizard-name-stage");
  await click(FINISH, { ms: 30000 });
  await waitUntil(async () => /\/studio\/p-/.test(url()), { label: "the studio opens on the new project", ms: 60000 });
  const id = url().match(/\/studio\/([^/?#]+)/)[1];
  await waitUntil(async () => (await attr("studio-headline", "data-door")) === "open", { label: "door open", ms: 60000 });
  const headline = await textOf("studio-headline");
  expect("studio headline is the name typed", headline === title, { detail: headline });
  const pill = await bodyText();
  expect("header pill states discipline · template · runtime", new RegExp(`${targetS ?? "\\d+"}s`, "i").test(pill), { detail: (pill.match(/[A-Z][^\n]*·[^\n]*\d+s/) || [""])[0].slice(0, 90) });
  record({ id, title, discipline, template, preset, targetS, borrowedStyle: borrowed, character: CHARACTER });
  return id;
}

async function openStep(id, key) {
  await goto(`/studio/${id}?step=${key}`);
  await waitUntil(async () => (await attr("studio-headline", "data-door")) === "open", { label: "door open", ms: 60000 });
  await sleep(600);
}

/** Guided educational research: type the topic, run, wait for the trace to land. */
async function runResearch(topic) {
  await waitFor({ label: "Topic" }, { ms: 60000 });
  const initial = await page.getByLabel("Topic").inputValue();
  expect("a fresh project's topic field is empty", initial === "", { detail: JSON.stringify(initial) });
  const preNote = await has("stand-in-note");
  expect("the stand-in is disclosed BEFORE the run", preNote && /whatever topic you type/i.test(await textOf("stand-in-note")));
  await fill({ label: "Topic" }, topic);
  await click("run-research");
  await waitUntil(async () => /complete/i.test(await textOf("run-status")), { label: "the run lands", ms: 60000 });
  const after = await textOf("stand-in-note").catch(() => "");
  expect("after the run the note names the stand-in against the typed topic", new RegExp(`not research on “${topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}”`).test(after), { detail: after.slice(0, 120) });
  await snap("research-landed");
}

/** Walk the guided deck: takes → conclusions → review → confirm → finish (to Script). */
async function walkGuidedToScript(id, { takeHottest = false, confirm = true } = {}) {
  await click(NEXT); // takes
  await sleep(400);
  const steel = await textOf("deck-card-steel-man").catch(() => "");
  expect("the steel-man card says it always travels and why", /always travels/i.test(steel), { detail: steel.replace(/\s+/g, " ").slice(0, 140) });
  const hot = await textOf("deck-card-c-reserve-was-the-product").catch(() => "");
  expect("the hottest take is labelled speculation and not taken by default", /not taken/i.test(hot) && /speculation/i.test(hot), { detail: hot.replace(/\s+/g, " ").slice(0, 120) });
  if (takeHottest) await click("deck-card-c-reserve-was-the-product");
  await snap("guided-takes");
  await click(NEXT); // conclusions
  await sleep(300);
  await click(NEXT); // review
  await sleep(300);
  if (confirm) {
    await click("confirm-scope");
    await sleep(400);
    expect("scope confirmed", /confirmed/i.test(await bodyText()));
  }
  await snap("guided-review");
  await click({ role: "button", name: /Go to Step 2/ });
  await waitUntil(async () => /step=script/.test(url()), { label: "the finish hands off to Script", ms: 15000 });
  await waitFor("view-candidates", { ms: 30000 });
  await sleep(600);
}

/** Pick one variant per slot and compose. `picks` = { "cold-open": "cold-open-a", ... } */
async function composeSpine(picks) {
  for (const [, v] of Object.entries(picks)) {
    // the tile toggles — a variant already picked must not be clicked again
    if ((await attr(`variant-${v}`, "aria-pressed")) === "true") continue;
    await click(`variant-${v}`);
  }
  await sleep(300);
  const status = await textOf("spine-status");
  expect("every part picked", /the spine is whole/i.test(status), { detail: status });
  await click("compose-spine");
  await sleep(500);
  expect("spine composed", /spine composed|composed/i.test(await textOf("spine-status")));
}

const SPINE_A = { "cold-open": "cold-open-a", introduction: "intro-a", "escalation-1": "esc1-a", "escalation-2": "esc2-a", "escalation-3": "esc3-a", reset: "reset-a", climax: "climax-a", tail: "tail-a" };

async function shelfCells(id) {
  await goto("/projects");
  await waitFor(`cell-${id}-research`, { ms: 60000 });
  const r = await attr(`cell-${id}-research`, "title");
  const s = await attr(`cell-${id}-script`, "title");
  return { research: r, script: s };
}

async function progressOf(id) {
  const row = await idb("projects", id);
  return row?.progress ?? row;
}
